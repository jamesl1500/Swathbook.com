-- =============================================================================
-- Swathbook schema · 7 · Multiple businesses per owner
--
-- * Owners can run several businesses (capped at 25 so a script can't mint thousands).
-- * Owners can always read their own business. INSERT ... RETURNING (what
--   supabase-js .insert().select() sends) evaluates the SELECT policy before
--   the AFTER trigger adds the owner's membership, so the old member-only
--   policy made creating a business from the app fail.
-- * is_slug_available() takes the business being edited, so its own slug
--   counts as free without exempting the owner's other businesses.
-- * create_booking() checks the service area before availability.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Several businesses per owner
-- -----------------------------------------------------------------------------

alter table public.businesses drop constraint if exists businesses_owner_id_key;

create index if not exists businesses_owner_idx on public.businesses (owner_id, created_at);

comment on table public.businesses is 'A field service business (tenant). Public booking link: swathbook.com/<slug>. One owner can run several.';
comment on column public.businesses.owner_id is 'RESTRICT on delete: removing the owner''s login must not silently erase a business and its financial history.';

create or replace function private.enforce_business_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- Serialize concurrent creates for the same owner so the count is exact.
    perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
    if (select count(*) from public.businesses where owner_id = new.owner_id) >= 25 then
        raise exception 'business_limit_reached' using errcode = 'P0001',
            hint = 'Contact support to run more than 25 businesses.';
    end if;
    return new;
end;
$$;

revoke all on function private.enforce_business_limit() from public, anon, authenticated;

drop trigger if exists businesses_enforce_limit on public.businesses;
create trigger businesses_enforce_limit
    before insert on public.businesses
    for each row execute function private.enforce_business_limit();

-- -----------------------------------------------------------------------------
-- Owners can read their own businesses (fixes INSERT ... RETURNING)
-- -----------------------------------------------------------------------------

drop policy if exists "Members read their businesses" on public.businesses;
drop policy if exists "Owners and members read their businesses" on public.businesses;
create policy "Owners and members read their businesses"
    on public.businesses for select to authenticated
    using (owner_id = (select auth.uid()) or id in (select private.member_business_ids()));

-- -----------------------------------------------------------------------------
-- Business-aware slug check
-- -----------------------------------------------------------------------------

drop function if exists public.is_slug_available(text);

-- Is this booking link free? Pass p_business_id when renaming an existing
-- business so its own current slug counts as available.
create or replace function public.is_slug_available(p_slug text, p_business_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select not exists (
        select 1 from public.businesses
        where slug = lower(p_slug)
          and (p_business_id is null or id <> p_business_id or id not in (select private.managed_business_ids()))
    );
$$;

revoke all on function public.is_slug_available(text, uuid) from public, anon;
grant execute on function public.is_slug_available(text, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- create_booking: service-area check first (cheapest, and the most useful
-- answer for someone too far away). Same signature, so grants are kept.
-- -----------------------------------------------------------------------------

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
