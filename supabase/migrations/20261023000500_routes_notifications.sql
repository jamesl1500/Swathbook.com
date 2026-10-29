-- =============================================================================
-- Swathbook schema · 5/6 · Routes & notifications
--
-- Daily routes per crew member (ordered by the AI optimizer) and the outbound
-- message log (confirmations, reminders, on-my-way texts).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Routes
-- -----------------------------------------------------------------------------

create table public.routes (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    member_id uuid,
    route_date date not null,
    status public.route_status not null default 'draft',

    start_address text check (char_length(start_address) <= 200),
    start_lat double precision check (start_lat between -90 and 90),
    start_lng double precision check (start_lng between -180 and 180),
    -- NULL end = return to the start.
    end_lat double precision check (end_lat between -90 and 90),
    end_lng double precision check (end_lng between -180 and 180),

    total_distance_meters integer check (total_distance_meters >= 0),
    total_duration_seconds integer check (total_duration_seconds >= 0),
    -- The same stops in booking order, before optimization. Powers "you saved 34 min".
    baseline_distance_meters integer check (baseline_distance_meters >= 0),
    baseline_duration_seconds integer check (baseline_duration_seconds >= 0),

    optimized_at timestamptz,
    optimization_provider text check (char_length(optimization_provider) <= 40),
    optimization_meta jsonb not null default '{}',
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (business_id, id),
    -- One route per person per day (NULLS NOT DISTINCT: one unassigned route per day, too).
    unique nulls not distinct (business_id, member_id, route_date),
    check ((start_lat is null) = (start_lng is null)),
    check ((end_lat is null) = (end_lng is null)),
    foreign key (business_id, member_id) references public.business_members (business_id, id) on delete set null (member_id)
);

comment on table public.routes is 'A crew member''s day. Stops are ordered by the route optimizer.';

create index routes_business_date_idx on public.routes (business_id, route_date);

create trigger routes_set_updated_at
    before update on public.routes
    for each row execute function private.set_updated_at();

create table public.route_stops (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null,
    route_id uuid not null,
    booking_id uuid not null,
    sequence integer not null check (sequence >= 1),
    status public.stop_status not null default 'pending',
    planned_arrival timestamptz,
    planned_departure timestamptz,
    -- Leg from the previous stop (or the route start).
    travel_distance_meters integer check (travel_distance_meters >= 0),
    travel_duration_seconds integer check (travel_duration_seconds >= 0),
    arrived_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- A job sits on at most one route.
    unique (booking_id),
    -- Deferrable so the optimizer can reorder stops in one transaction.
    constraint route_stops_sequence_key unique (route_id, sequence) deferrable initially deferred,
    check (planned_departure is null or planned_arrival is null or planned_departure >= planned_arrival),
    foreign key (business_id, route_id) references public.routes (business_id, id) on delete cascade,
    foreign key (business_id, booking_id) references public.bookings (business_id, id) on delete cascade
);

create index route_stops_route_idx on public.route_stops (business_id, route_id, sequence);
create index route_stops_booking_idx on public.route_stops (business_id, booking_id);

create trigger route_stops_set_updated_at
    before update on public.route_stops
    for each row execute function private.set_updated_at();

create function private.stamp_route_stop()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.status is distinct from old.status then
        if new.status = 'arrived' then new.arrived_at := coalesce(new.arrived_at, now()); end if;
        if new.status = 'completed' then
            new.arrived_at := coalesce(new.arrived_at, now());
            new.completed_at := coalesce(new.completed_at, now());
        end if;
    end if;
    return new;
end;
$$;

create trigger route_stops_stamp
    before update of status on public.route_stops
    for each row execute function private.stamp_route_stop();

-- -----------------------------------------------------------------------------
-- Notifications (outbound email/SMS log + send queue)
-- -----------------------------------------------------------------------------

create table public.notifications (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    booking_id uuid,
    customer_id uuid,
    channel public.notification_channel not null,
    template text not null check (template ~ '^[a-z0-9_.]{2,60}$'),
    to_address text not null check (char_length(to_address) between 3 and 320),
    status public.notification_status not null default 'queued',
    scheduled_for timestamptz not null default now(),
    sent_at timestamptz,
    attempts integer not null default 0 check (attempts >= 0),
    provider text check (char_length(provider) <= 40),
    provider_message_id text,
    error text check (char_length(error) <= 1000),
    payload jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (business_id, booking_id) references public.bookings (business_id, id) on delete cascade,
    foreign key (business_id, customer_id) references public.customers (business_id, id) on delete cascade
);

comment on table public.notifications is 'Outbound messages. A worker (service role) sends rows where status = queued and scheduled_for <= now().';

create index notifications_queue_idx on public.notifications (scheduled_for) where status = 'queued';
create index notifications_booking_idx on public.notifications (business_id, booking_id);
create index notifications_customer_idx on public.notifications (business_id, customer_id);
create unique index notifications_provider_message_key on public.notifications (provider, provider_message_id)
    where provider_message_id is not null;

create trigger notifications_set_updated_at
    before update on public.notifications
    for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.routes enable row level security;
alter table public.route_stops enable row level security;
alter table public.notifications enable row level security;

create policy "Members read routes"
    on public.routes for select to authenticated
    using (business_id in (select private.member_business_ids()));
create policy "Owners and admins insert routes"
    on public.routes for insert to authenticated
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins update routes"
    on public.routes for update to authenticated
    using (business_id in (select private.managed_business_ids()))
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins delete routes"
    on public.routes for delete to authenticated
    using (business_id in (select private.managed_business_ids()));

create policy "Members read route stops"
    on public.route_stops for select to authenticated
    using (business_id in (select private.member_business_ids()));
create policy "Owners and admins insert route stops"
    on public.route_stops for insert to authenticated
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins update route stops"
    on public.route_stops for update to authenticated
    using (business_id in (select private.managed_business_ids()))
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins delete route stops"
    on public.route_stops for delete to authenticated
    using (business_id in (select private.managed_business_ids()));

create policy "Owners and admins read notifications"
    on public.notifications for select to authenticated
    using (business_id in (select private.managed_business_ids()));
