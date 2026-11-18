-- =============================================================================
-- Neighbor discounts only for coordinates the server vouches for
--
-- A slot's neighbor_discount_percent says the business has a job booked near
-- the given point that day. Taking any p_lat/p_lng from anyone would let a
-- script probe a grid of points and map where (and when) customers get work
-- done. So get_available_slots now ignores coordinates unless the caller is
-- the server (service role), which only passes the location of an address it
-- geocoded and rate limited (see the booking page's locateAddress).
--
-- Anyone can still ask for slots without a location, as the customer app does.
-- =============================================================================

create or replace function public.get_available_slots(
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
    v_neighbor_days date[] := '{}'::date[];
    -- The API role the request runs as. Security definer changes the current
    -- user, not this setting, so it still names the caller.
    v_from_api_client boolean := coalesce(current_setting('role', true), '') in ('anon', 'authenticated');
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

    if not v_from_api_client and b.neighbor_discount_percent > 0 and p_lat between -90 and 90 and p_lng between -180 and 180 then
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

comment on function public.get_available_slots(text, uuid[], date, integer, double precision, double precision, integer) is
    'Open slots for a published business. p_lat/p_lng (neighbor discounts) only count when the server calls it.';
