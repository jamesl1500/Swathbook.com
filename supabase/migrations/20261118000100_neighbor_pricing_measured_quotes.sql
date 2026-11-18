-- =============================================================================
-- Neighbor pricing and measured (by-area) quotes.
--
-- Neighbor pricing: a business can knock a percentage off a booking on a day
-- it already has work near the customer's address. Those days are flagged on
-- the booking page, and create_booking applies the discount itself (and gives
-- the job to the crew member who is already in the area), so a route gets
-- denser without the owner lifting a finger.
--
--   businesses.neighbor_discount_percent  0 (off) to 50
--   businesses.neighbor_radius_miles      what counts as "nearby" (0.1 to 3)
--
-- Measured quotes: a service can be priced by area. The customer outlines it
-- on a satellite photo on the booking page (or types the size), and the price
-- and length of the job follow from the square footage. The service's
-- price_cents and duration_minutes are the minimums, so a booking without a
-- measurement (the customer app, a typed address with no map) still prices.
--
--   services.price_per_1000_sqft_cents    the rate; null = not priced by area
--   services.minutes_per_1000_sqft        optional; how the job grows with area
--   bookings.measured_area_sqft           what the customer measured
--   bookings.measurement                  the outline they drew: [[[lat, lng], ...], ...]
--   bookings.discount_reason              e.g. "Neighbor discount (10%)"
--
-- get_available_slots gains p_lat/p_lng/p_area_sqft and returns each slot's
-- neighbor discount; create_booking gains p_measurement. (create_booking body
-- from 20261114000200_service_questions.sql; get_booking_page from the same.)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Columns
-- -----------------------------------------------------------------------------

alter table public.businesses
    add column neighbor_discount_percent integer not null default 0 check (neighbor_discount_percent between 0 and 50),
    add column neighbor_radius_miles numeric(3, 2) not null default 0.5 check (neighbor_radius_miles between 0.1 and 3);

comment on column public.businesses.neighbor_discount_percent is 'Percent off a booking on a day with other work nearby. 0 turns it off.';
comment on column public.businesses.neighbor_radius_miles is 'How close another job must be for the neighbor discount.';

grant insert (neighbor_discount_percent, neighbor_radius_miles), update (neighbor_discount_percent, neighbor_radius_miles)
    on public.businesses to authenticated;

alter table public.services
    add column price_per_1000_sqft_cents integer check (price_per_1000_sqft_cents between 1 and 1000000),
    add column minutes_per_1000_sqft integer check (minutes_per_1000_sqft between 1 and 600),
    add constraint services_area_pricing_consistent check (
        (price_per_1000_sqft_cents is null and minutes_per_1000_sqft is null)
        -- Priced by area means "from" the minimum.
        or (price_per_1000_sqft_cents is not null and price_type = 'starting_at')
    );

comment on column public.services.price_per_1000_sqft_cents is 'Price per 1,000 sq ft the customer measures. price_cents is the minimum.';
comment on column public.services.minutes_per_1000_sqft is 'Minutes per 1,000 sq ft. duration_minutes is the minimum.';

grant insert (price_per_1000_sqft_cents, minutes_per_1000_sqft), update (price_per_1000_sqft_cents, minutes_per_1000_sqft)
    on public.services to authenticated;

alter table public.bookings
    add column measured_area_sqft integer check (measured_area_sqft between 100 and 1000000),
    add column measurement jsonb check (jsonb_typeof(measurement) = 'array' and jsonb_array_length(measurement) between 1 and 10),
    add column discount_reason text check (char_length(discount_reason) <= 80),
    add constraint bookings_measurement_has_area check (measurement is null or measured_area_sqft is not null);

comment on column public.bookings.measured_area_sqft is 'Square footage the customer measured (or typed) when booking a service priced by area.';
comment on column public.bookings.measurement is 'The outline the customer drew: polygons of [lat, lng] points.';
comment on column public.bookings.discount_reason is 'Why discount_cents is set, in words the customer sees.';

grant update (discount_reason) on public.bookings to authenticated;

-- -----------------------------------------------------------------------------
-- Pricing helpers. One place for the maths, used by slots and bookings alike
-- (src/libs/pricing.ts mirrors it for the booking page's preview).
-- -----------------------------------------------------------------------------

create function private.service_line_price(p_service public.services, p_area_sqft integer)
returns integer
language sql
immutable
set search_path = ''
as $$
    select case
        when p_service.price_per_1000_sqft_cents is not null and p_area_sqft is not null
            then least(10000000, greatest(p_service.price_cents, round(p_area_sqft::numeric * p_service.price_per_1000_sqft_cents / 1000.0)::integer))
        else p_service.price_cents
    end;
$$;

-- Rounded up to 5 minutes, never shorter than the service's own length.
create function private.service_line_minutes(p_service public.services, p_area_sqft integer)
returns integer
language sql
immutable
set search_path = ''
as $$
    select case
        when p_service.minutes_per_1000_sqft is not null and p_area_sqft is not null
            then least(1440, greatest(p_service.duration_minutes, (ceil(p_area_sqft::numeric * p_service.minutes_per_1000_sqft / 1000.0 / 5) * 5)::integer))
        else p_service.duration_minutes
    end;
$$;

-- The deposit on a line at its actual price (a percent deposit grows with a bigger lawn).
create function private.service_line_deposit(p_service public.services, p_price_cents integer)
returns integer
language sql
immutable
set search_path = ''
as $$
    select case p_service.deposit_type
        when 'percent' then round(p_price_cents::numeric * p_service.deposit_percent / 100.0)::integer
        when 'fixed' then least(p_service.deposit_amount_cents, p_price_cents)
        else 0
    end;
$$;

-- An area the customer measured, or null when it's missing or out of range.
create function private.clean_area_sqft(p_area integer)
returns integer
language sql
immutable
set search_path = ''
as $$
    select case when p_area between 100 and 1000000 then p_area end;
$$;

-- -----------------------------------------------------------------------------
-- Neighbor days: the local dates in [p_from, p_to] when the business already
-- has a live job within its neighbor radius of (p_lat, p_lng). Another job at
-- the same spot (the customer's own house) doesn't count. Only a yes/no per
-- day leaves this function, never where the other job is.
-- -----------------------------------------------------------------------------

create function private.neighbor_days(
    p_business_id uuid,
    p_lat double precision,
    p_lng double precision,
    p_from date,
    p_to date
)
returns setof date
language sql
stable
security definer
set search_path = ''
as $$
    select distinct (bk.scheduled_start at time zone b.timezone)::date
    from public.businesses b
    join public.bookings bk on bk.business_id = b.id
    join public.customer_addresses a on a.business_id = b.id and a.id = bk.address_id
    where b.id = p_business_id
      and b.neighbor_discount_percent > 0
      and p_lat is not null and p_lng is not null
      and bk.status in ('requested', 'confirmed', 'in_progress')
      and bk.scheduled_start >= (p_from::timestamp at time zone b.timezone)
      and bk.scheduled_start < ((p_to + 1)::timestamp at time zone b.timezone)
      and a.lat is not null and a.lng is not null
      -- A cheap box first (a degree of latitude is ~69 miles), then the real distance.
      and a.lat between p_lat - b.neighbor_radius_miles / 69.0 and p_lat + b.neighbor_radius_miles / 69.0
      and private.distance_miles(p_lat, p_lng, a.lat, a.lng) <= b.neighbor_radius_miles
      and private.distance_miles(p_lat, p_lng, a.lat, a.lng) >= 0.01;
$$;

revoke all on function private.neighbor_days(uuid, double precision, double precision, date, date) from public, anon, authenticated;
grant execute on function private.neighbor_days(uuid, double precision, double precision, date, date) to service_role;

revoke all on function
    private.service_line_price(public.services, integer),
    private.service_line_minutes(public.services, integer),
    private.service_line_deposit(public.services, integer),
    private.clean_area_sqft(integer)
from public, anon, authenticated;
grant execute on function
    private.service_line_price(public.services, integer),
    private.service_line_minutes(public.services, integer),
    private.service_line_deposit(public.services, integer),
    private.clean_area_sqft(integer)
to service_role;

-- -----------------------------------------------------------------------------
-- get_available_slots: lengths follow the measured area, and each slot says
-- whether it gets the neighbor discount.
-- -----------------------------------------------------------------------------

drop function public.get_available_slots(text, uuid[], date, integer);

create function public.get_available_slots(
    p_slug text,
    p_service_ids uuid[],
    p_from date default null,
    p_days integer default 14,
    p_lat double precision default null,
    p_lng double precision default null,
    p_area_sqft integer default null
)
returns table (slot_start timestamptz, slot_end timestamptz, neighbor_discount_percent integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    b public.businesses%rowtype;
    v_duration integer;
    v_matched integer;
    v_area integer := private.clean_area_sqft(p_area_sqft);
    v_from date;
    v_neighbor_days date[] := '{}';
begin
    select * into b from public.businesses
    where slug = lower(p_slug) and is_published and private.business_has_access(id);
    if b.id is null or coalesce(cardinality(p_service_ids), 0) = 0 or cardinality(p_service_ids) > 10 then
        return;
    end if;

    select sum(private.service_line_minutes(s, v_area)), count(*) into v_duration, v_matched
    from public.services s
    where s.business_id = b.id and s.id = any(p_service_ids) and s.is_active and s.is_public;

    if v_matched <> (select count(distinct x) from unnest(p_service_ids) as x) then
        return;
    end if;

    if b.neighbor_discount_percent > 0 and p_lat between -90 and 90 and p_lng between -180 and 180 then
        v_from := greatest(coalesce(p_from, (now() at time zone b.timezone)::date), (now() at time zone b.timezone)::date);
        select coalesce(array_agg(d), '{}') into v_neighbor_days
        from private.neighbor_days(b.id, p_lat, p_lng, v_from, v_from + greatest(least(coalesce(p_days, 14), 62), 1) - 1) as d;
    end if;

    return query
    select s.slot_start, s.slot_end,
           case when (s.slot_start at time zone b.timezone)::date = any(v_neighbor_days) then b.neighbor_discount_percent else 0 end
    from private.available_slots(b.id, v_duration, p_from, p_days) s;
end;
$$;

revoke all on function public.get_available_slots(text, uuid[], date, integer, double precision, double precision, integer) from public;
grant execute on function public.get_available_slots(text, uuid[], date, integer, double precision, double precision, integer)
to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- get_booking_page: services say how they're priced by area, and the business
-- says whether it offers the neighbor discount.
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
            'service_area', b.service_area,
            'logo_path', b.logo_path,
            'cover_path', b.cover_path,
            'brand_color', b.brand_color,
            'timezone', b.timezone,
            'currency', b.currency,
            'service_radius_miles', b.service_radius_miles,
            'cancellation_window_hours', b.cancellation_window_hours,
            'deposit_refund_policy', b.deposit_refund_policy,
            'accepts_online_payments', coalesce(sca.charges_enabled, false),
            'neighbor_discount_percent', b.neighbor_discount_percent
        ),
        'services', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', s.id,
                'name', s.name,
                'description', s.description,
                'price_type', s.price_type,
                'price_cents', s.price_cents,
                'duration_minutes', s.duration_minutes,
                'deposit_cents', case when coalesce(sca.charges_enabled, false) then private.service_deposit_cents(s) else 0 end,
                'deposit_type', case when coalesce(sca.charges_enabled, false) then s.deposit_type else 'none' end,
                'deposit_percent', s.deposit_percent,
                'deposit_amount_cents', s.deposit_amount_cents,
                'price_per_1000_sqft_cents', s.price_per_1000_sqft_cents,
                'minutes_per_1000_sqft', s.minutes_per_1000_sqft,
                'questions', coalesce((
                    select jsonb_agg(jsonb_build_object(
                        'id', q.id,
                        'prompt', q.prompt,
                        'kind', q.kind,
                        'options', to_jsonb(q.options),
                        'required', q.is_required
                    ) order by q.sort_order, q.created_at)
                    from public.service_questions q
                    where q.business_id = b.id and q.service_id = s.id
                ), '[]'::jsonb)
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

-- -----------------------------------------------------------------------------
-- create_booking: takes the customer's measurement and applies the neighbor
-- discount.
--   p_measurement: { area_sqft, polygons?: [[[lat, lng], ...], ...] }
--                  The caller (service role) validates the outline and works
--                  out the area; here it's only range-checked.
-- -----------------------------------------------------------------------------

drop function public.create_booking(uuid, uuid[], timestamptz, jsonb, jsonb, text, public.booking_source, jsonb);

create function public.create_booking(
    p_business_id uuid,
    p_service_ids uuid[],
    p_start timestamptz,
    p_customer jsonb,
    p_address jsonb,
    p_customer_notes text default null,
    p_source public.booking_source default 'booking_page',
    p_answers jsonb default null,
    p_measurement jsonb default null
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
    v_answers jsonb := coalesce(p_answers, '[]'::jsonb);
    v_area integer;
    v_polygons jsonb;
    v_day date;
    v_neighbor_percent integer := 0;
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

    -- The measurement: an area in range, and an outline that looks like one.
    if p_measurement is not null and jsonb_typeof(p_measurement) = 'object' then
        if jsonb_typeof(p_measurement -> 'area_sqft') <> 'number' then
            raise exception 'invalid_measurement' using errcode = '22023';
        end if;
        v_area := private.clean_area_sqft(round((p_measurement ->> 'area_sqft')::numeric)::integer);
        if v_area is null then
            raise exception 'invalid_measurement' using errcode = '22023';
        end if;
        v_polygons := p_measurement -> 'polygons';
        if v_polygons is not null and jsonb_typeof(v_polygons) = 'null' then
            v_polygons := null;
        end if;
        if v_polygons is not null and (jsonb_typeof(v_polygons) <> 'array' or jsonb_array_length(v_polygons) not between 1 and 10) then
            raise exception 'invalid_measurement' using errcode = '22023';
        end if;
    elsif p_measurement is not null and jsonb_typeof(p_measurement) <> 'null' then
        raise exception 'invalid_measurement' using errcode = '22023';
    end if;

    select sca.stripe_account_id into v_stripe_account
    from public.stripe_connect_accounts sca
    where sca.business_id = b.id and sca.charges_enabled;

    select sum(private.service_line_minutes(s, v_area)),
           sum(private.service_line_deposit(s, private.service_line_price(s, v_area))),
           count(*)
    into v_duration, v_deposit, v_matched
    from public.services s
    where s.business_id = b.id and s.id = any(p_service_ids) and s.is_active
      and (s.is_public or p_source <> 'booking_page');

    if v_matched <> cardinality(p_service_ids) then
        raise exception 'invalid_services' using errcode = '22023';
    end if;

    -- A measurement only belongs on a booking with a service priced by area.
    if v_area is not null and not exists (
        select 1 from public.services s
        where s.business_id = b.id and s.id = any(p_service_ids) and s.price_per_1000_sqft_cents is not null
    ) then
        v_area := null;
        v_polygons := null;
    end if;

    -- Answers: each to a different question on a booked service, not too long,
    -- and one of the options for a choice question.
    if jsonb_typeof(v_answers) <> 'array' or jsonb_array_length(v_answers) > 100
       or exists (select 1 from jsonb_array_elements(v_answers) a where jsonb_typeof(a) <> 'object')
    then
        raise exception 'invalid_answers' using errcode = '22023';
    end if;
    if exists (
        select 1
        from jsonb_array_elements(v_answers) a
        left join public.service_questions q
            on q.id::text = lower(a ->> 'question_id') and q.business_id = b.id and q.service_id = any(p_service_ids)
        where q.id is null
           or char_length(trim(coalesce(a ->> 'answer', ''))) > 1000
           or (q.kind = 'choice' and trim(coalesce(a ->> 'answer', '')) <> '' and not (trim(a ->> 'answer') = any(q.options)))
    ) or (select count(distinct lower(a ->> 'question_id')) from jsonb_array_elements(v_answers) a) <> jsonb_array_length(v_answers)
    then
        raise exception 'invalid_answers' using errcode = '22023';
    end if;
    -- Customers booking themselves answer every required question.
    if p_source = 'booking_page' and exists (
        select 1 from public.service_questions q
        where q.business_id = b.id and q.service_id = any(p_service_ids) and q.is_required
          and not exists (
              select 1 from jsonb_array_elements(v_answers) a
              where lower(a ->> 'question_id') = q.id::text and trim(coalesce(a ->> 'answer', '')) <> ''
          )
    ) then
        raise exception 'answers_required' using errcode = '22023';
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
    v_day := (p_start at time zone b.timezone)::date;

    if not exists (
        select 1 from private.available_slots(b.id, v_duration, v_day, 1) s
        where s.slot_start = p_start
    ) then
        raise exception 'slot_unavailable' using errcode = 'P0001';
    end if;

    -- Already working near this address that day? Then it's cheaper.
    if b.neighbor_discount_percent > 0 and exists (select 1 from private.neighbor_days(b.id, v_lat, v_lng, v_day, v_day)) then
        v_neighbor_percent := b.neighbor_discount_percent;
        v_deposit := round(v_deposit::numeric * (100 - v_neighbor_percent) / 100.0)::integer;
    end if;

    -- Who goes: on a neighbor day, someone already working nearby (that's the
    -- point of the discount); otherwise spread work to whoever has the fewest
    -- jobs that day.
    select fm.id into v_member
    from private.free_members(b.id, p_start, v_end) as fm(id)
    order by
        (v_neighbor_percent > 0 and exists (
            select 1
            from public.bookings bk
            join public.customer_addresses a on a.id = bk.address_id
            where bk.business_id = b.id and bk.assigned_member_id = fm.id
              and bk.status in ('requested', 'confirmed', 'in_progress')
              and (bk.scheduled_start at time zone b.timezone)::date = v_day
              and a.lat is not null
              and private.distance_miles(v_lat, v_lng, a.lat, a.lng) <= b.neighbor_radius_miles
        )) desc,
        (
            select count(*) from public.bookings bk
            where bk.business_id = b.id and bk.assigned_member_id = fm.id
              and private.booking_is_active(bk.status, bk.hold_expires_at)
              and (bk.scheduled_start at time zone b.timezone)::date = v_day
        ),
        fm.id
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
        scheduled_start, scheduled_end, hold_expires_at, currency, deposit_due_cents, customer_notes, created_by,
        measured_area_sqft, measurement
    )
    values (
        b.id, v_customer, v_address, v_member,
        case when v_deposit > 0 then 'pending_payment'
             when b.auto_confirm then 'confirmed'
             else 'requested' end::public.booking_status,
        p_source, p_start, v_end,
        case when v_deposit > 0 then now() + interval '30 minutes' end,
        b.currency, v_deposit, left(p_customer_notes, 2000), null,
        v_area, v_polygons
    )
    returning * into v_booking;

    insert into public.booking_items (business_id, booking_id, service_id, name, description, unit_price_cents, duration_minutes, sort_order)
    select b.id, v_booking.id, s.id, s.name, s.description,
           private.service_line_price(s, v_area), private.service_line_minutes(s, v_area),
           array_position(p_service_ids, s.id)
    from public.services s
    where s.business_id = b.id and s.id = any(p_service_ids);

    if v_neighbor_percent > 0 then
        update public.bookings bk
        set discount_cents = round(bk.subtotal_cents::numeric * v_neighbor_percent / 100.0)::integer,
            discount_reason = format('Neighbor discount (%s%%)', v_neighbor_percent)
        where bk.id = v_booking.id and bk.subtotal_cents > 0;
    end if;

    -- Answers in the order the customer saw them: by service, then question.
    insert into public.booking_answers (business_id, booking_id, question_id, service_name, prompt, answer, sort_order)
    select b.id, v_booking.id, q.id, s.name, q.prompt, trim(a ->> 'answer'),
           row_number() over (order by array_position(p_service_ids, q.service_id), q.sort_order, q.created_at)
    from jsonb_array_elements(v_answers) a
    join public.service_questions q on q.id::text = lower(a ->> 'question_id') and q.business_id = b.id
    join public.services s on s.business_id = b.id and s.id = q.service_id
    where trim(coalesce(a ->> 'answer', '')) <> '';

    select * into v_booking from public.bookings where id = v_booking.id;

    return query select
        v_booking.id, v_booking.reference, v_booking.public_token, v_booking.status,
        v_booking.total_cents, v_booking.deposit_due_cents, v_booking.hold_expires_at,
        v_stripe_account, v_customer;
end;
$$;

revoke all on function public.create_booking(uuid, uuid[], timestamptz, jsonb, jsonb, text, public.booking_source, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.create_booking(uuid, uuid[], timestamptz, jsonb, jsonb, text, public.booking_source, jsonb, jsonb)
to service_role;
