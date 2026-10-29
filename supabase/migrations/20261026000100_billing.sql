-- =============================================================================
-- Billing: every business gets a 14-day free trial (no card) when it finishes
-- onboarding, then needs a subscription. Without one, its booking page pauses:
-- the public page, open times and new bookings all switch off, while the owner
-- keeps full access to the dashboard. Plans also cap team seats.
-- public.subscriptions rows are written only by the Stripe webhook (service role).
-- =============================================================================

alter table public.businesses add column trial_ends_at timestamptz;
comment on column public.businesses.trial_ends_at is 'End of the free trial. Set when onboarding completes; not client-writable.';

create function private.start_trial()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.onboarding_completed_at is not null and new.trial_ends_at is null then
        new.trial_ends_at := now() + interval '14 days';
    end if;
    return new;
end;
$$;

create trigger businesses_start_trial
    before insert or update of onboarding_completed_at on public.businesses
    for each row execute function private.start_trial();

-- Businesses that are already live start their trial today.
update public.businesses set trial_ends_at = now() + interval '14 days'
where onboarding_completed_at is not null and trial_ends_at is null;

-- Statuses that keep a booking page open. past_due gets Stripe's retry window.
create function private.business_has_access(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (select 1 from public.businesses b where b.id = p_business_id and b.trial_ends_at > now())
        or exists (
            select 1 from public.subscriptions s
            where s.business_id = p_business_id and s.status in ('trialing', 'active', 'past_due')
        );
$$;

-- Team seats (including the owner). NULL means unlimited. Trials get Crew's limit.
create function private.seat_limit(p_business_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
    select case s.plan
               when 'solo' then 1
               when 'crew' then 5
               when 'fleet' then null
           end
    from public.subscriptions s
    where s.business_id = p_business_id and s.status in ('trialing', 'active', 'past_due')
    union all
    select 5
    limit 1;
$$;

revoke all on function private.business_has_access(uuid), private.seat_limit(uuid) from public, anon, authenticated;
grant execute on function private.business_has_access(uuid), private.seat_limit(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Public booking functions: closed while a business has no trial or plan.
-- create_booking also holds unpaid deposits for 30 minutes (was 15).
-- -----------------------------------------------------------------------------

create or replace function public.get_booking_page(p_slug text)
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
        ), '[]'::jsonb),
        'photos', coalesce((
            select jsonb_agg(jsonb_build_object('id', p.id, 'storage_path', p.storage_path, 'caption', p.caption)
                             order by p.sort_order, p.created_at, p.id)
            from public.business_photos p
            where p.business_id = b.id
        ), '[]'::jsonb)
    )
    from public.businesses b
    left join public.stripe_connect_accounts sca on sca.business_id = b.id
    where b.slug = lower(p_slug) and b.is_published and private.business_has_access(b.id);
$$;

create or replace function public.get_available_slots(
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
    select id into v_business_id from public.businesses
    where slug = lower(p_slug) and is_published and private.business_has_access(id);
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

create or replace function public.create_booking(
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
    select * into b from public.businesses
    where id = p_business_id and is_published and private.business_has_access(id)
    for update;
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

    -- Cheapest check first, and the most useful answer for someone too far away.
    if v_lat is not null and v_lng is not null and b.base_lat is not null and b.service_radius_miles is not null
       and private.distance_miles(b.base_lat, b.base_lng, v_lat, v_lng) > b.service_radius_miles then
        raise exception 'outside_service_area' using errcode = 'P0001';
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
        case when v_deposit > 0 then now() + interval '30 minutes' end,
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

create or replace function public.create_business_invitation(
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

    -- Seats: active members plus invites still waiting, against the plan's limit.
    if private.seat_limit(p_business_id) is not null
       and (select count(*) from public.business_members m where m.business_id = p_business_id and m.status = 'active')
         + (select count(*) from public.business_invitations i
            where i.business_id = p_business_id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())
         >= private.seat_limit(p_business_id) then
        raise exception 'seat_limit' using errcode = 'P0001';
    end if;

    insert into public.business_invitations (business_id, email, role, token_hash, invited_by)
    values (p_business_id, v_email, p_role, private.sha256_hex(v_token), (select auth.uid()));

    return v_token;
end;
$$;

create or replace function public.accept_business_invitation(p_token text)
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

    if private.seat_limit(v_invite.business_id) is not null
       and not exists (select 1 from public.business_members m where m.business_id = v_invite.business_id and m.user_id = (select auth.uid()))
       and (select count(*) from public.business_members m where m.business_id = v_invite.business_id and m.status = 'active')
         >= private.seat_limit(v_invite.business_id) then
        raise exception 'seat_limit' using errcode = 'P0001';
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
