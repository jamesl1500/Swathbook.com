-- =============================================================================
-- Swathbook schema · 6/6 · API functions, privileges & storage
--
-- Who can call what
--   anon           get_booking_page, get_available_slots (read-only, safe columns)
--   authenticated  tables via RLS + column grants; job/route status, invites, slug check
--   service_role   create_booking (server creates the Stripe PaymentIntent right
--                  after), release_expired_holds, and all Stripe/webhook writes
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Defaults that tie rows to the caller
-- -----------------------------------------------------------------------------

alter table public.bookings alter column created_by set default auth.uid();

-- -----------------------------------------------------------------------------
-- Internal helpers
-- -----------------------------------------------------------------------------

create function private.distance_miles(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
    -- Haversine; good to a fraction of a percent at service-area scale.
    select 3958.8 * 2 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2)
        + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    ));
$$;

-- True if a booking blocks its time slot right now.
create function private.booking_is_active(p_status public.booking_status, p_hold_expires_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
    select p_status in ('requested', 'confirmed', 'in_progress')
        or (p_status = 'pending_payment' and p_hold_expires_at > now());
$$;

-- Bookable members free for [p_start, p_end) once buffers, other jobs and time off are respected.
create function private.free_members(p_business_id uuid, p_start timestamptz, p_end timestamptz)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
    select m.id
    from public.business_members m
    join public.businesses b on b.id = m.business_id
    where m.business_id = p_business_id
      and m.status = 'active'
      and m.is_bookable
      and not exists (
          select 1 from public.bookings bk
          where bk.business_id = p_business_id
            and bk.assigned_member_id = m.id
            and private.booking_is_active(bk.status, bk.hold_expires_at)
            and bk.scheduled_range && tstzrange(
                p_start - make_interval(mins => b.buffer_minutes),
                p_end + make_interval(mins => b.buffer_minutes), '[)')
      )
      and not exists (
          select 1 from public.time_off t
          where t.business_id = p_business_id
            and t.member_id = m.id
            and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(p_start, p_end, '[)')
      );
$$;

-- Open start times for a job of p_duration_minutes, honoring hours, lead time,
-- booking window, business closures, crew capacity and unassigned jobs.
create function private.available_slots(
    p_business_id uuid,
    p_duration_minutes integer,
    p_from date,
    p_days integer
)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    b public.businesses%rowtype;
    v_today date;
    v_from date;
    v_to date;
    v_duration interval := make_interval(mins => p_duration_minutes);
begin
    select * into b from public.businesses where id = p_business_id;
    if not found or p_duration_minutes is null or p_duration_minutes <= 0 then
        return;
    end if;

    v_today := (now() at time zone b.timezone)::date;
    v_from := greatest(coalesce(p_from, v_today), v_today);
    v_to := least(v_from + greatest(least(coalesce(p_days, 14), 62), 1) - 1, v_today + b.booking_window_days);

    return query
    with days as (
        select d::date as day
        from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') as d
    ),
    windows as (
        select (days.day + h.opens_at) at time zone b.timezone as open_at,
               (days.day + h.closes_at) at time zone b.timezone as close_at
        from days
        join public.business_hours h
          on h.business_id = b.id and h.weekday = extract(dow from days.day)::smallint
    ),
    candidates as (
        select s as start_at, s + v_duration as end_at
        from windows w
        cross join lateral generate_series(w.open_at, w.close_at - v_duration, make_interval(mins => b.slot_interval_minutes)) as s
    )
    select c.start_at, c.end_at
    from candidates c
    where c.start_at >= now() + make_interval(mins => b.booking_lead_time_minutes)
      and not exists (
          select 1 from public.time_off t
          where t.business_id = b.id
            and t.member_id is null
            and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(c.start_at, c.end_at, '[)')
      )
      and (
          (select count(*) from private.free_members(b.id, c.start_at, c.end_at))
          - (select count(*) from public.bookings bk
             where bk.business_id = b.id
               and bk.assigned_member_id is null
               and private.booking_is_active(bk.status, bk.hold_expires_at)
               and bk.scheduled_range && tstzrange(
                   c.start_at - make_interval(mins => b.buffer_minutes),
                   c.end_at + make_interval(mins => b.buffer_minutes), '[)'))
      ) > 0
    order by c.start_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- Public booking page (anon)
-- -----------------------------------------------------------------------------

create function public.get_booking_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'business', jsonb_build_object(
            'id', b.id,
            'name', b.name,
            'slug', b.slug,
            'trade', b.trade,
            'description', b.description,
            'phone', b.phone,
            'email', b.email,
            'website_url', b.website_url,
            'logo_path', b.logo_path,
            'cover_path', b.cover_path,
            'brand_color', b.brand_color,
            'timezone', b.timezone,
            'currency', b.currency,
            'service_radius_miles', b.service_radius_miles,
            'cancellation_window_hours', b.cancellation_window_hours,
            'deposit_refund_policy', b.deposit_refund_policy,
            'accepts_online_payments', coalesce(sca.charges_enabled, false)
        ),
        'services', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', s.id,
                'name', s.name,
                'description', s.description,
                'price_type', s.price_type,
                'price_cents', s.price_cents,
                'duration_minutes', s.duration_minutes,
                'deposit_cents', case when coalesce(sca.charges_enabled, false) then private.service_deposit_cents(s) else 0 end
            ) order by s.sort_order, s.name)
            from public.services s
            where s.business_id = b.id and s.is_active and s.is_public
        ), '[]'::jsonb),
        'hours', coalesce((
            select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens_at', h.opens_at, 'closes_at', h.closes_at)
                             order by h.weekday)
            from public.business_hours h
            where h.business_id = b.id
        ), '[]'::jsonb)
    )
    from public.businesses b
    left join public.stripe_connect_accounts sca on sca.business_id = b.id
    where b.slug = lower(p_slug) and b.is_published;
$$;

comment on function public.get_booking_page(text) is 'Everything the public booking page needs, and nothing private. NULL when the slug is unknown or unpublished.';

create function public.get_available_slots(
    p_slug text,
    p_service_ids uuid[],
    p_from date default null,
    p_days integer default 14
)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_business_id uuid;
    v_duration integer;
    v_matched integer;
begin
    select id into v_business_id from public.businesses where slug = lower(p_slug) and is_published;
    if v_business_id is null or coalesce(cardinality(p_service_ids), 0) = 0 or cardinality(p_service_ids) > 10 then
        return;
    end if;

    select sum(s.duration_minutes), count(*) into v_duration, v_matched
    from public.services s
    where s.business_id = v_business_id and s.id = any(p_service_ids) and s.is_active and s.is_public;

    if v_matched <> (select count(distinct x) from unnest(p_service_ids) as x) then
        return;
    end if;

    return query select * from private.available_slots(v_business_id, v_duration, p_from, p_days);
end;
$$;

-- -----------------------------------------------------------------------------
-- Booking creation (server only)
--
-- Call from the Next.js server with the service-role key, after validating input
-- and rate limiting. If deposit_due_cents > 0, create a PaymentIntent on
-- stripe_account_id and insert the matching payments row; the payment webhook
-- confirms the booking. Unpaid holds expire after 15 minutes.
-- -----------------------------------------------------------------------------

create function public.create_booking(
    p_business_id uuid,
    p_service_ids uuid[],
    p_start timestamptz,
    p_customer jsonb,
    p_address jsonb,
    p_customer_notes text default null,
    p_source public.booking_source default 'booking_page'
)
returns table (
    booking_id uuid,
    reference text,
    public_token text,
    status public.booking_status,
    total_cents integer,
    deposit_due_cents integer,
    hold_expires_at timestamptz,
    stripe_account_id text,
    customer_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    b public.businesses%rowtype;
    v_stripe_account text;
    v_duration integer;
    v_deposit integer;
    v_matched integer;
    v_end timestamptz;
    v_member uuid;
    v_email text;
    v_customer uuid;
    v_address uuid;
    v_lat double precision := (p_address ->> 'lat')::double precision;
    v_lng double precision := (p_address ->> 'lng')::double precision;
    v_booking public.bookings%rowtype;
begin
    -- Lock the business row: bookings for one business are created one at a
    -- time, so two customers can never both win the last slot.
    select * into b from public.businesses where id = p_business_id and is_published for update;
    if not found then
        raise exception 'business_not_found' using errcode = 'P0002';
    end if;

    if coalesce(cardinality(p_service_ids), 0) = 0 or cardinality(p_service_ids) > 10
       or cardinality(p_service_ids) <> (select count(distinct x) from unnest(p_service_ids) as x) then
        raise exception 'invalid_services' using errcode = '22023';
    end if;

    select sca.stripe_account_id into v_stripe_account
    from public.stripe_connect_accounts sca
    where sca.business_id = b.id and sca.charges_enabled;

    select sum(s.duration_minutes), sum(private.service_deposit_cents(s)), count(*)
    into v_duration, v_deposit, v_matched
    from public.services s
    where s.business_id = b.id and s.id = any(p_service_ids) and s.is_active
      and (s.is_public or p_source <> 'booking_page');

    if v_matched <> cardinality(p_service_ids) then
        raise exception 'invalid_services' using errcode = '22023';
    end if;

    -- No payout account yet: the booking goes through without online payment.
    if v_stripe_account is null then
        v_deposit := 0;
    end if;

    -- Free up slots held by customers who never paid.
    update public.bookings bk
    set status = 'cancelled', cancellation_reason = 'Payment hold expired'
    where bk.business_id = b.id and bk.status = 'pending_payment' and bk.hold_expires_at <= now();

    v_end := p_start + make_interval(mins => v_duration);

    if not exists (
        select 1 from private.available_slots(b.id, v_duration, (p_start at time zone b.timezone)::date, 1) s
        where s.slot_start = p_start
    ) then
        raise exception 'slot_unavailable' using errcode = 'P0001';
    end if;

    if v_lat is not null and v_lng is not null and b.base_lat is not null and b.service_radius_miles is not null
       and private.distance_miles(b.base_lat, b.base_lng, v_lat, v_lng) > b.service_radius_miles then
        raise exception 'outside_service_area' using errcode = 'P0001';
    end if;

    -- Spread work: the free member with the fewest jobs that day.
    select fm.id into v_member
    from private.free_members(b.id, p_start, v_end) as fm(id)
    order by (
        select count(*) from public.bookings bk
        where bk.business_id = b.id and bk.assigned_member_id = fm.id
          and private.booking_is_active(bk.status, bk.hold_expires_at)
          and (bk.scheduled_start at time zone b.timezone)::date = (p_start at time zone b.timezone)::date
    ), fm.id
    limit 1;

    if v_member is null then
        raise exception 'slot_unavailable' using errcode = 'P0001';
    end if;

    -- Customer (deduplicated by email within the business)
    v_email := lower(nullif(trim(p_customer ->> 'email'), ''));
    if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'invalid_email' using errcode = '22023';
    end if;

    insert into public.customers as c (business_id, full_name, email, phone)
    values (b.id, left(trim(p_customer ->> 'full_name'), 120), v_email, nullif(trim(p_customer ->> 'phone'), ''))
    on conflict (business_id, email) where email is not null
    do update set full_name = excluded.full_name, phone = coalesce(excluded.phone, c.phone)
    returning c.id into v_customer;

    -- Address (reuse an identical one)
    select a.id into v_address
    from public.customer_addresses a
    where a.business_id = b.id and a.customer_id = v_customer
      and lower(a.line1) = lower(trim(p_address ->> 'line1'))
      and coalesce(a.postal_code, '') = coalesce(trim(p_address ->> 'postal_code'), '')
    limit 1;

    if v_address is null then
        insert into public.customer_addresses (
            business_id, customer_id, line1, line2, city, region, postal_code, country, lat, lng, access_notes, is_primary
        )
        values (
            b.id, v_customer,
            trim(p_address ->> 'line1'),
            nullif(trim(p_address ->> 'line2'), ''),
            nullif(trim(p_address ->> 'city'), ''),
            nullif(trim(p_address ->> 'region'), ''),
            nullif(trim(p_address ->> 'postal_code'), ''),
            coalesce(upper(nullif(trim(p_address ->> 'country'), '')), 'US'),
            v_lat, v_lng,
            left(nullif(trim(p_address ->> 'access_notes'), ''), 500),
            not exists (select 1 from public.customer_addresses a where a.customer_id = v_customer and a.is_primary)
        )
        returning id into v_address;
    end if;

    insert into public.bookings (
        business_id, customer_id, address_id, assigned_member_id, status, source,
        scheduled_start, scheduled_end, hold_expires_at, currency, deposit_due_cents, customer_notes, created_by
    )
    values (
        b.id, v_customer, v_address, v_member,
        case when v_deposit > 0 then 'pending_payment'
             when b.auto_confirm then 'confirmed'
             else 'requested' end::public.booking_status,
        p_source, p_start, v_end,
        case when v_deposit > 0 then now() + interval '15 minutes' end,
        b.currency, v_deposit, left(p_customer_notes, 2000), null
    )
    returning * into v_booking;

    insert into public.booking_items (business_id, booking_id, service_id, name, description, unit_price_cents, duration_minutes, sort_order)
    select b.id, v_booking.id, s.id, s.name, s.description, s.price_cents, s.duration_minutes,
           array_position(p_service_ids, s.id)
    from public.services s
    where s.business_id = b.id and s.id = any(p_service_ids);

    select * into v_booking from public.bookings where id = v_booking.id;

    return query select
        v_booking.id, v_booking.reference, v_booking.public_token, v_booking.status,
        v_booking.total_cents, v_booking.deposit_due_cents, v_booking.hold_expires_at,
        v_stripe_account, v_customer;
end;
$$;

-- Releases slots held by unpaid bookings. Schedule with pg_cron every few
-- minutes, e.g. select cron.schedule('release-holds', '*/5 * * * *', 'select public.release_expired_holds()');
create function public.release_expired_holds()
returns integer
language sql
security definer
set search_path = ''
as $$
    with released as (
        update public.bookings
        set status = 'cancelled', cancellation_reason = 'Payment hold expired'
        where status = 'pending_payment' and hold_expires_at <= now()
        returning 1
    )
    select count(*)::integer from released;
$$;

-- -----------------------------------------------------------------------------
-- Team actions (authenticated)
-- -----------------------------------------------------------------------------

create function public.is_slug_available(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select not exists (
        select 1 from public.businesses
        where slug = lower(p_slug) and owner_id is distinct from (select auth.uid())
    );
$$;

-- Crew can start, finish or no-show their own jobs; owners/admins can make any
-- valid change. The status guard trigger still validates the transition.
create function public.update_job_status(
    p_booking_id uuid,
    p_status public.booking_status,
    p_reason text default null
)
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_booking public.bookings%rowtype;
begin
    select * into v_booking from public.bookings where id = p_booking_id for update;
    if not found or v_booking.business_id not in (select private.member_business_ids()) then
        raise exception 'booking_not_found' using errcode = 'P0002';
    end if;

    if not (
        v_booking.business_id in (select private.managed_business_ids())
        or (v_booking.assigned_member_id in (select private.current_member_ids())
            and p_status in ('in_progress', 'completed', 'no_show'))
    ) then
        raise exception 'not_allowed' using errcode = '42501';
    end if;

    update public.bookings
    set status = p_status,
        cancellation_reason = case when p_status = 'cancelled' then left(p_reason, 500) else cancellation_reason end
    where id = p_booking_id;

    return p_status;
end;
$$;

-- Crew update stops on their own route. Arriving starts the job; completing the
-- stop completes it.
create function public.update_route_stop_status(p_stop_id uuid, p_status public.stop_status)
returns public.stop_status
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_stop public.route_stops%rowtype;
    v_route public.routes%rowtype;
    v_booking_status public.booking_status;
begin
    select * into v_stop from public.route_stops where id = p_stop_id for update;
    if not found or v_stop.business_id not in (select private.member_business_ids()) then
        raise exception 'stop_not_found' using errcode = 'P0002';
    end if;

    select * into v_route from public.routes where id = v_stop.route_id;
    if not (
        v_stop.business_id in (select private.managed_business_ids())
        or v_route.member_id in (select private.current_member_ids())
    ) then
        raise exception 'not_allowed' using errcode = '42501';
    end if;

    update public.route_stops set status = p_status where id = p_stop_id;

    select status into v_booking_status from public.bookings where id = v_stop.booking_id;
    if p_status = 'arrived' and v_booking_status = 'confirmed' then
        update public.bookings set status = 'in_progress' where id = v_stop.booking_id;
    elsif p_status = 'completed' and v_booking_status in ('confirmed', 'in_progress') then
        update public.bookings set status = 'completed' where id = v_stop.booking_id;
    end if;

    if v_route.status in ('draft', 'optimized') and p_status in ('en_route', 'arrived', 'completed') then
        update public.routes set status = 'in_progress', started_at = coalesce(started_at, now()) where id = v_route.id;
    end if;

    return p_status;
end;
$$;

-- Returns the raw invite token (email it); only its hash is stored.
create function public.create_business_invitation(
    p_business_id uuid,
    p_email text,
    p_role public.member_role default 'crew'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_token text := private.random_token();
    v_email text := lower(trim(p_email));
begin
    if p_business_id not in (select private.managed_business_ids()) then
        raise exception 'not_allowed' using errcode = '42501';
    end if;
    if p_role = 'owner' then
        raise exception 'cannot_invite_owner' using errcode = '22023';
    end if;
    if p_role = 'admin' and p_business_id not in (select private.owned_business_ids()) then
        raise exception 'only_owner_can_invite_admins' using errcode = '42501';
    end if;

    update public.business_invitations
    set revoked_at = now()
    where business_id = p_business_id and email = v_email and accepted_at is null and revoked_at is null;

    insert into public.business_invitations (business_id, email, role, token_hash, invited_by)
    values (p_business_id, v_email, p_role, private.sha256_hex(v_token), (select auth.uid()));

    return v_token;
end;
$$;

create function public.accept_business_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_invite public.business_invitations%rowtype;
    v_email text := lower((select auth.jwt()) ->> 'email');
begin
    if (select auth.uid()) is null then
        raise exception 'not_authenticated' using errcode = '42501';
    end if;

    select * into v_invite
    from public.business_invitations
    where token_hash = private.sha256_hex(p_token)
      and accepted_at is null and revoked_at is null and expires_at > now()
    for update;

    -- Same error either way, so tokens and emails can't be probed.
    if not found or v_invite.email is distinct from v_email then
        raise exception 'invitation_invalid' using errcode = 'P0002';
    end if;

    insert into public.business_members (business_id, user_id, role)
    values (v_invite.business_id, (select auth.uid()), v_invite.role)
    on conflict (business_id, user_id) do update
        set status = 'active',
            role = case when public.business_members.role = 'owner' then 'owner'::public.member_role else excluded.role end;

    update public.business_invitations
    set accepted_at = now(), accepted_by = (select auth.uid())
    where id = v_invite.id;

    return v_invite.business_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges: start from zero, then grant exactly what each role needs.
-- Supabase grants ALL on new public tables to anon/authenticated by default;
-- RLS would still guard rows, but column grants also stop clients from writing
-- money totals, tokens, Stripe ids or ownership on rows they *can* update.
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema private to service_role;

-- RLS helpers and the predicates they use must be callable by the policy's role.
grant execute on function
    private.member_business_ids(), private.managed_business_ids(), private.owned_business_ids(),
    private.current_member_ids(), private.teammate_user_ids()
to authenticated;

-- API functions
grant execute on function public.get_booking_page(text) to anon, authenticated;
grant execute on function public.get_available_slots(text, uuid[], date, integer) to anon, authenticated;
grant execute on function public.is_slug_available(text) to authenticated;
grant execute on function public.update_job_status(uuid, public.booking_status, text) to authenticated;
grant execute on function public.update_route_stop_status(uuid, public.stop_status) to authenticated;
grant execute on function public.create_business_invitation(uuid, text, public.member_role) to authenticated;
grant execute on function public.accept_business_invitation(text) to authenticated;
-- create_booking and release_expired_holds: service_role only (granted above).

-- profiles
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_path) on public.profiles to authenticated;

-- businesses
grant select on public.businesses to authenticated;
grant insert (
    owner_id, name, slug, trade, description, phone, email, website_url, logo_path, cover_path, brand_color,
    timezone, currency, base_address, base_lat, base_lng, service_radius_miles,
    booking_lead_time_minutes, booking_window_days, slot_interval_minutes, buffer_minutes, auto_confirm,
    cancellation_window_hours, deposit_refund_policy, email_reminders_enabled, sms_reminders_enabled,
    reminder_hours_before, is_published, onboarding_completed_at
) on public.businesses to authenticated;
grant update (
    name, slug, trade, description, phone, email, website_url, logo_path, cover_path, brand_color,
    timezone, base_address, base_lat, base_lng, service_radius_miles,
    booking_lead_time_minutes, booking_window_days, slot_interval_minutes, buffer_minutes, auto_confirm,
    cancellation_window_hours, deposit_refund_policy, email_reminders_enabled, sms_reminders_enabled,
    reminder_hours_before, is_published, onboarding_completed_at
) on public.businesses to authenticated;

-- team
grant select, delete on public.business_members to authenticated;
grant update (role, status, display_name, calendar_color, is_bookable) on public.business_members to authenticated;
grant select, delete on public.business_invitations to authenticated;
grant update (revoked_at) on public.business_invitations to authenticated;

-- catalog & availability
grant select, delete on public.services to authenticated;
grant insert (
    business_id, name, description, price_type, price_cents, duration_minutes,
    deposit_type, deposit_percent, deposit_amount_cents, is_active, is_public, sort_order
) on public.services to authenticated;
grant update (
    name, description, price_type, price_cents, duration_minutes,
    deposit_type, deposit_percent, deposit_amount_cents, is_active, is_public, sort_order
) on public.services to authenticated;

grant select, delete on public.business_hours to authenticated;
grant insert (business_id, weekday, opens_at, closes_at) on public.business_hours to authenticated;
grant update (opens_at, closes_at) on public.business_hours to authenticated;

grant select, delete on public.time_off to authenticated;
grant insert (business_id, member_id, starts_at, ends_at, reason) on public.time_off to authenticated;
grant update (member_id, starts_at, ends_at, reason) on public.time_off to authenticated;

-- customers
grant select, delete on public.customers to authenticated;
grant insert (business_id, full_name, email, phone, notes, tags, email_opt_in, sms_opt_in) on public.customers to authenticated;
grant update (full_name, email, phone, notes, tags, email_opt_in, sms_opt_in) on public.customers to authenticated;

grant select, delete on public.customer_addresses to authenticated;
grant insert (
    business_id, customer_id, label, line1, line2, city, region, postal_code, country, lat, lng, access_notes, is_primary
) on public.customer_addresses to authenticated;
grant update (
    label, line1, line2, city, region, postal_code, country, lat, lng, access_notes, is_primary
) on public.customer_addresses to authenticated;

grant select, delete on public.recurring_series to authenticated;
grant insert (
    business_id, customer_id, address_id, service_id, assigned_member_id, frequency,
    starts_on, ends_on, start_time, duration_minutes, price_cents, is_active
) on public.recurring_series to authenticated;
grant update (
    address_id, service_id, assigned_member_id, frequency, starts_on, ends_on, start_time,
    duration_minutes, price_cents, is_active
) on public.recurring_series to authenticated;

-- bookings (no DELETE: cancel instead, so history and payments stay intact)
grant select on public.bookings to authenticated;
grant insert (
    business_id, customer_id, address_id, assigned_member_id, recurring_series_id, status, source,
    scheduled_start, scheduled_end, currency, discount_cents, tax_cents, tip_cents, deposit_due_cents,
    customer_notes, internal_notes
) on public.bookings to authenticated;
grant update (
    address_id, assigned_member_id, status, scheduled_start, scheduled_end, discount_cents, tax_cents,
    tip_cents, deposit_due_cents, customer_notes, internal_notes, cancellation_reason
) on public.bookings to authenticated;

grant select, delete on public.booking_items to authenticated;
grant insert (
    business_id, booking_id, service_id, name, description, quantity, unit_price_cents, duration_minutes, sort_order
) on public.booking_items to authenticated;
grant update (name, description, quantity, unit_price_cents, duration_minutes, sort_order) on public.booking_items to authenticated;

grant select on public.booking_events to authenticated;

grant select, delete on public.booking_attachments to authenticated;
grant insert (business_id, booking_id, kind, storage_path, caption, content_type, size_bytes, uploaded_by)
    on public.booking_attachments to authenticated;

-- money: read-only for clients
grant select on public.stripe_connect_accounts, public.subscriptions, public.payments, public.refunds to authenticated;
grant select on public.invoices to authenticated;
grant insert (business_id, booking_id, customer_id, status, due_date, memo) on public.invoices to authenticated;
grant update (status, due_date, memo) on public.invoices to authenticated;
-- stripe_webhook_events: service_role only.

-- routes
grant select, delete on public.routes to authenticated;
grant insert (business_id, member_id, route_date, status, start_address, start_lat, start_lng, end_lat, end_lng)
    on public.routes to authenticated;
grant update (member_id, route_date, status, start_address, start_lat, start_lng, end_lat, end_lng, started_at, completed_at)
    on public.routes to authenticated;

grant select, delete on public.route_stops to authenticated;
grant insert (business_id, route_id, booking_id, sequence, planned_arrival, planned_departure) on public.route_stops to authenticated;
grant update (sequence, status, planned_arrival, planned_departure) on public.route_stops to authenticated;

grant select on public.notifications to authenticated;

-- -----------------------------------------------------------------------------
-- Storage
--   business-assets (public): logos/covers at <business_id>/<file>
--   job-files (private):      job photos/docs at <business_id>/<booking_id>/<file>
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
    ('business-assets', 'business-assets', true, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
    ('job-files', 'job-files', false, 20971520, array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "Owners and admins read business assets"
    on storage.objects for select to authenticated
    using (bucket_id = 'business-assets'
           and (storage.foldername(name))[1] in (select t.id::text from private.managed_business_ids() as t(id)));
create policy "Owners and admins upload business assets"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'business-assets'
                and (storage.foldername(name))[1] in (select t.id::text from private.managed_business_ids() as t(id)));
create policy "Owners and admins replace business assets"
    on storage.objects for update to authenticated
    using (bucket_id = 'business-assets'
           and (storage.foldername(name))[1] in (select t.id::text from private.managed_business_ids() as t(id)))
    with check (bucket_id = 'business-assets'
                and (storage.foldername(name))[1] in (select t.id::text from private.managed_business_ids() as t(id)));
create policy "Owners and admins delete business assets"
    on storage.objects for delete to authenticated
    using (bucket_id = 'business-assets'
           and (storage.foldername(name))[1] in (select t.id::text from private.managed_business_ids() as t(id)));

create policy "Members read job files"
    on storage.objects for select to authenticated
    using (bucket_id = 'job-files'
           and (storage.foldername(name))[1] in (select t.id::text from private.member_business_ids() as t(id)));
create policy "Members upload job files"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'job-files'
                and (storage.foldername(name))[1] in (select t.id::text from private.member_business_ids() as t(id)));
create policy "Uploaders and managers delete job files"
    on storage.objects for delete to authenticated
    using (bucket_id = 'job-files' and (
        (storage.foldername(name))[1] in (select t.id::text from private.managed_business_ids() as t(id))
        or (owner_id = (select auth.uid())::text
            and (storage.foldername(name))[1] in (select t.id::text from private.member_business_ids() as t(id)))
    ));
