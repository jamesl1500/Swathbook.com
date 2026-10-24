-- =============================================================================
-- Swathbook schema · 8 · Dashboard: customers, scheduling, routes, overview
--
-- * Fast "search anything" on customers (name, email, phone) via pg_trgm.
-- * Google place data on addresses, so routes can use geocoded stops.
-- * An arrival window for route planning (how early/late a crew may arrive
--   relative to a job's scheduled start).
-- * Read functions for the dashboard that run with the caller's RLS.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Customer search
-- -----------------------------------------------------------------------------

alter table public.customers
    add column search_text text generated always as (
        lower(full_name || ' ' || coalesce(email, '') || ' ' || coalesce(phone, ''))
    ) stored;

create index customers_search_idx on public.customers using gin (search_text extensions.gin_trgm_ops);

comment on column public.customers.search_text is 'Lowercased name, email and phone for substring search.';

-- -----------------------------------------------------------------------------
-- Geocoded addresses
-- -----------------------------------------------------------------------------

alter table public.customer_addresses
    add column google_place_id text check (char_length(google_place_id) <= 300),
    add column formatted_address text check (char_length(formatted_address) <= 300);

grant insert (google_place_id, formatted_address), update (google_place_id, formatted_address)
    on public.customer_addresses to authenticated;

-- -----------------------------------------------------------------------------
-- Route planning
-- -----------------------------------------------------------------------------

alter table public.businesses
    add column arrival_window_minutes integer not null default 60 check (arrival_window_minutes between 0 and 480);

comment on column public.businesses.arrival_window_minutes is
    'Route planning may move an arrival this many minutes before or after the scheduled start.';

grant update (arrival_window_minutes) on public.businesses to authenticated;
grant insert (arrival_window_minutes) on public.businesses to authenticated;

-- -----------------------------------------------------------------------------
-- Customer list with booking stats (runs as the caller, so RLS applies)
-- -----------------------------------------------------------------------------

create function public.customer_list(
    p_business_id uuid,
    p_search text default null,
    p_limit integer default 50,
    p_offset integer default 0
)
returns table (
    id uuid,
    full_name text,
    email text,
    phone text,
    tags text[],
    created_at timestamptz,
    booking_count bigint,
    last_booking_at timestamptz,
    next_booking_at timestamptz,
    lifetime_paid_cents bigint,
    total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
    with matching as (
        select c.*
        from public.customers c
        where c.business_id = p_business_id
          and (coalesce(trim(p_search), '') = '' or c.search_text like '%' || lower(trim(p_search)) || '%')
    )
    select
        m.id, m.full_name, m.email, m.phone, m.tags, m.created_at,
        (select count(*) from public.bookings b where b.customer_id = m.id and b.status <> 'cancelled'),
        (select max(b.scheduled_start) from public.bookings b
          where b.customer_id = m.id and b.scheduled_start < now() and b.status in ('confirmed', 'in_progress', 'completed')),
        (select min(b.scheduled_start) from public.bookings b
          where b.customer_id = m.id and b.scheduled_start >= now() and b.status in ('pending_payment', 'requested', 'confirmed')),
        coalesce((select sum(b.amount_paid_cents - b.amount_refunded_cents) from public.bookings b where b.customer_id = m.id), 0),
        count(*) over ()
    from matching m
    order by m.full_name
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.customer_list(uuid, text, integer, integer) is
    'Customers with booking stats for the dashboard. Security invoker: RLS limits it to the caller''s businesses.';

-- -----------------------------------------------------------------------------
-- Dashboard overview numbers (caller's RLS applies)
-- -----------------------------------------------------------------------------

create function public.business_overview(p_business_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    with b as (
        select id, timezone from public.businesses where id = p_business_id
    ),
    bounds as (
        select
            (date_trunc('day', now() at time zone b.timezone)) at time zone b.timezone as today_start,
            (date_trunc('day', now() at time zone b.timezone) + interval '1 day') at time zone b.timezone as today_end,
            (date_trunc('day', now() at time zone b.timezone) + interval '7 days') at time zone b.timezone as week_end,
            (date_trunc('month', now() at time zone b.timezone)) at time zone b.timezone as month_start
        from b
    )
    select jsonb_build_object(
        'jobs_today', (select count(*) from public.bookings bk, bounds
                       where bk.business_id = p_business_id
                         and bk.scheduled_start >= bounds.today_start and bk.scheduled_start < bounds.today_end
                         and bk.status in ('confirmed', 'in_progress', 'completed')),
        'jobs_next_7_days', (select count(*) from public.bookings bk, bounds
                             where bk.business_id = p_business_id
                               and bk.scheduled_start >= bounds.today_start and bk.scheduled_start < bounds.week_end
                               and bk.status in ('pending_payment', 'requested', 'confirmed', 'in_progress')),
        'requests_waiting', (select count(*) from public.bookings bk
                             where bk.business_id = p_business_id and bk.status = 'requested'),
        'customers', (select count(*) from public.customers c where c.business_id = p_business_id),
        'collected_this_month_cents', coalesce((
            select sum(p.amount_cents - p.amount_refunded_cents) from public.payments p, bounds
            where p.business_id = p_business_id and p.succeeded_at >= bounds.month_start
              and p.status in ('succeeded', 'partially_refunded', 'refunded')), 0)
    )
    from b;
$$;

revoke all on function public.customer_list(uuid, text, integer, integer) from public, anon;
revoke all on function public.business_overview(uuid) from public, anon;
grant execute on function public.customer_list(uuid, text, integer, integer) to authenticated, service_role;
grant execute on function public.business_overview(uuid) to authenticated, service_role;

-- Status filters on the schedule and overview ("requests waiting", "today").
create index bookings_business_status_idx on public.bookings (business_id, status, scheduled_start);

-- Column defaults run with the inserting role's privileges, so owners creating
-- jobs by hand (through RLS, not the service role) need these generators.
-- Both only return random strings and read no data.
grant execute on function private.booking_reference(), private.random_token() to authenticated;

-- -----------------------------------------------------------------------------
-- Account deletion. Called by the app with the service role after it has
-- re-checked the user's password. Deletes the businesses the user owns (and,
-- through cascades, everything in them), then the user; memberships in other
-- businesses go with the user. Refuses while an owned business still has
-- upcoming jobs, so customers aren't left holding bookings nobody will work.
-- -----------------------------------------------------------------------------
create function public.delete_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_upcoming integer;
begin
    select count(*) into v_upcoming
    from public.bookings bk
    join public.businesses b on b.id = bk.business_id
    where b.owner_id = p_user_id
      and bk.status in ('pending_payment', 'requested', 'confirmed', 'in_progress')
      and bk.scheduled_end > now();

    if v_upcoming > 0 then
        raise exception 'upcoming_jobs' using detail = v_upcoming::text;
    end if;

    delete from public.businesses where owner_id = p_user_id;
    delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;
