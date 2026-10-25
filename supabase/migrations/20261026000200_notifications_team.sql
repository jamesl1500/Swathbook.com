-- =============================================================================
-- Booking emails, unpaid-deposit holds, and the team list.
--
-- Outbox: triggers on bookings queue rows in public.notifications; the app's
-- worker (/api/cron/notifications) claims due rows and sends them through
-- Resend. Queuing in the database means every path (public booking page,
-- manual jobs, Stripe webhooks) sends the same emails, exactly once.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Queueing
-- -----------------------------------------------------------------------------

create function private.enqueue_notification(
    p_booking public.bookings,
    p_template text,
    p_to text,
    p_for_customer boolean,
    p_at timestamptz default now(),
    p_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.notifications (business_id, booking_id, customer_id, channel, template, to_address, scheduled_for, payload)
    select p_booking.business_id, p_booking.id, case when p_for_customer then p_booking.customer_id end,
           'email', p_template, lower(trim(p_to)), p_at, p_payload
    where nullif(trim(p_to), '') is not null;
$$;

create function private.cancel_queued_notifications(p_booking_id uuid, p_templates text[] default null)
returns void
language sql
security definer
set search_path = ''
as $$
    update public.notifications
    set status = 'canceled'
    where booking_id = p_booking_id and status = 'queued'
      and (p_templates is null or template = any(p_templates));
$$;

create function private.queue_booking_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_business public.businesses%rowtype;
    v_customer_email text;
    v_owner_email text;
    v_became_live boolean;
begin
    select * into v_business from public.businesses where id = new.business_id;
    select email into v_customer_email from public.customers where id = new.customer_id;
    select coalesce(v_business.email, u.email) into v_owner_email from auth.users u where u.id = v_business.owner_id;

    -- A booking "goes live" when it's created as confirmed/requested, or its deposit gets paid.
    v_became_live := new.status in ('confirmed', 'requested')
        and (tg_op = 'INSERT' or old.status = 'pending_payment');

    if tg_op = 'INSERT' and new.status = 'pending_payment' then
        -- Nudge the customer if they haven't paid 10 minutes in (the hold lasts 30).
        perform private.enqueue_notification(new, 'booking.deposit_reminder', v_customer_email, true, now() + interval '10 minutes');
    end if;

    if tg_op = 'UPDATE' and old.status = 'pending_payment' and new.status <> 'pending_payment' then
        perform private.cancel_queued_notifications(new.id, array['booking.deposit_reminder']);
    end if;

    if v_became_live then
        perform private.enqueue_notification(new, case new.status when 'confirmed' then 'booking.confirmed' else 'booking.requested' end, v_customer_email, true);
        if new.source <> 'manual' then
            perform private.enqueue_notification(new, case new.status when 'confirmed' then 'owner.new_booking' else 'owner.new_request' end, v_owner_email, false);
        end if;
    elsif tg_op = 'UPDATE' and old.status = 'requested' and new.status = 'confirmed' then
        perform private.enqueue_notification(new, 'booking.confirmed', v_customer_email, true);
    elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled' then
        perform private.cancel_queued_notifications(new.id);
        perform private.enqueue_notification(
            new,
            case when old.status = 'pending_payment' and new.cancellation_reason = 'Payment hold expired'
                 then 'booking.hold_expired' else 'booking.cancelled' end,
            v_customer_email, true
        );
    end if;

    if tg_op = 'UPDATE' and new.scheduled_start is distinct from old.scheduled_start
       and new.status in ('confirmed', 'requested') and old.status = new.status then
        perform private.enqueue_notification(new, 'booking.rescheduled', v_customer_email, true, now(),
                                             jsonb_build_object('previous_start', old.scheduled_start));
    end if;

    -- Day-before style reminder, kept in step with the booking's time and status.
    if tg_op = 'UPDATE' then
        perform private.cancel_queued_notifications(new.id, array['booking.reminder']);
    end if;
    if new.status = 'confirmed' and v_business.email_reminders_enabled
       and new.scheduled_start - make_interval(hours => v_business.reminder_hours_before) > now() then
        perform private.enqueue_notification(new, 'booking.reminder', v_customer_email, true,
                                             new.scheduled_start - make_interval(hours => v_business.reminder_hours_before));
    end if;

    return null;
end;
$$;

create trigger bookings_queue_notifications
    after insert or update of status, scheduled_start on public.bookings
    for each row execute function private.queue_booking_notifications();

revoke all on function private.enqueue_notification(public.bookings, text, text, boolean, timestamptz, jsonb),
    private.cancel_queued_notifications(uuid, text[]), private.queue_booking_notifications()
from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Worker: claim due emails. SKIP LOCKED lets overlapping runs share the queue;
-- pushing scheduled_for ahead is a lease, so a crashed run retries later.
-- -----------------------------------------------------------------------------

create function public.claim_notifications(p_limit integer default 25, p_booking_id uuid default null)
returns setof public.notifications
language sql
security definer
set search_path = ''
as $$
    update public.notifications n
    set attempts = n.attempts + 1, scheduled_for = now() + interval '5 minutes'
    where n.id in (
        select q.id from public.notifications q
        where q.status = 'queued' and q.channel = 'email' and q.scheduled_for <= now()
          and (p_booking_id is null or q.booking_id = p_booking_id)
        order by q.scheduled_for
        limit least(greatest(p_limit, 1), 100)
        for update skip locked
    )
    returning n.*;
$$;

revoke all on function public.claim_notifications(integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Schedules (pg_cron)
--   * Release unpaid deposit holds every minute (pure SQL, always on).
--   * Ping the app's email worker every minute when there's work. Configure by
--     adding two Vault secrets: app_url (https://your-domain) and cron_secret
--     (the app's CRON_SECRET). Without them the job does nothing.
-- -----------------------------------------------------------------------------

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function private.invoke_notification_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_url text;
    v_secret text;
begin
    if not exists (select 1 from public.notifications where status = 'queued' and scheduled_for <= now()) then
        return;
    end if;
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'app_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
    if v_url is null or v_secret is null then
        return;
    end if;
    perform net.http_post(
        url := rtrim(v_url, '/') || '/api/cron/notifications',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
        body := '{}'::jsonb,
        timeout_milliseconds := 15000
    );
end;
$$;

revoke all on function private.invoke_notification_worker() from public, anon, authenticated;

select cron.schedule('release-expired-holds', '* * * * *', 'select public.release_expired_holds()');
select cron.schedule('send-notifications', '* * * * *', 'select private.invoke_notification_worker()');

-- -----------------------------------------------------------------------------
-- Team list with emails (auth.users isn't readable by clients). Any member can
-- see their teammates; managers also get pending invitations through RLS.
-- -----------------------------------------------------------------------------

create function public.team_members(p_business_id uuid)
returns table (
    member_id uuid,
    user_id uuid,
    role public.member_role,
    status public.member_status,
    full_name text,
    email text,
    calendar_color text,
    joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select m.id, m.user_id, m.role, m.status,
           coalesce(nullif(m.display_name, ''), nullif(p.full_name, ''), split_part(u.email, '@', 1)),
           u.email::text, m.calendar_color, m.created_at
    from public.business_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.business_id = p_business_id
      and p_business_id in (select private.member_business_ids())
    order by (m.role = 'owner') desc, m.created_at;
$$;

revoke all on function public.team_members(uuid) from public, anon;
grant execute on function public.team_members(uuid) to authenticated, service_role;

-- Seats for the billing and team pages: used (members + live invites) and the plan's limit.
create function public.team_seats(p_business_id uuid)
returns table (used integer, seat_limit integer)
language sql
stable
security definer
set search_path = ''
as $$
    select
        ((select count(*) from public.business_members m where m.business_id = p_business_id and m.status = 'active')
         + (select count(*) from public.business_invitations i
            where i.business_id = p_business_id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()))::integer,
        private.seat_limit(p_business_id)
    where p_business_id in (select private.member_business_ids());
$$;

revoke all on function public.team_seats(uuid) from public, anon;
grant execute on function public.team_seats(uuid) to authenticated, service_role;

-- An invite link's business name and email, so the accept page can greet the person.
create function public.invitation_preview(p_token text)
returns table (business_name text, email text, role public.member_role, expired boolean)
language sql
stable
security definer
set search_path = ''
as $$
    select b.name, i.email, i.role, (i.expires_at <= now() or i.revoked_at is not null or i.accepted_at is not null)
    from public.business_invitations i
    join public.businesses b on b.id = i.business_id
    where p_token ~ '^[0-9a-f]{64}$' and i.token_hash = private.sha256_hex(p_token);
$$;

revoke all on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Invites waiting for the signed-in person, so they can join from onboarding
-- however they arrived (invite link, a later login, or signing up on their
-- own). Accepting by id requires a verified email that matches the invite,
-- the same proof the emailed token gives.
-- -----------------------------------------------------------------------------

create function public.my_pending_invitations()
returns table (invitation_id uuid, business_name text, role public.member_role, invited_by_name text)
language sql
stable
security definer
set search_path = ''
as $$
    select i.id, b.name, i.role, coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1))
    from public.business_invitations i
    join public.businesses b on b.id = i.business_id
    left join public.profiles p on p.id = i.invited_by
    left join auth.users u on u.id = i.invited_by
    where i.email = lower((select auth.jwt()) ->> 'email')
      and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
      and not exists (select 1 from public.business_members m where m.business_id = i.business_id and m.user_id = (select auth.uid()))
    order by i.created_at desc;
$$;

create function public.accept_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_invite public.business_invitations%rowtype;
    v_email text := lower((select auth.jwt()) ->> 'email');
begin
    if (select auth.uid()) is null
       or not exists (select 1 from auth.users u where u.id = (select auth.uid()) and u.email_confirmed_at is not null) then
        raise exception 'not_authenticated' using errcode = '42501';
    end if;

    select * into v_invite
    from public.business_invitations
    where id = p_invitation_id and accepted_at is null and revoked_at is null and expires_at > now()
    for update;
    if not found or v_invite.email is distinct from v_email then
        raise exception 'invitation_invalid' using errcode = 'P0002';
    end if;

    if private.seat_limit(v_invite.business_id) is not null
       and (select count(*) from public.business_members m where m.business_id = v_invite.business_id and m.status = 'active')
         >= private.seat_limit(v_invite.business_id) then
        raise exception 'seat_limit' using errcode = 'P0001';
    end if;

    insert into public.business_members (business_id, user_id, role)
    values (v_invite.business_id, (select auth.uid()), v_invite.role)
    on conflict (business_id, user_id) do update set status = 'active';

    update public.business_invitations
    set accepted_at = now(), accepted_by = (select auth.uid())
    where id = v_invite.id;

    return v_invite.business_id;
end;
$$;

revoke all on function public.my_pending_invitations(), public.accept_invitation(uuid) from public, anon;
grant execute on function public.my_pending_invitations(), public.accept_invitation(uuid) to authenticated;
