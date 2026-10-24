-- =============================================================================
-- Swathbook schema · 3/6 · Customers & bookings
--
-- The CRM (customers + addresses), recurring plans, and bookings (jobs) with
-- their line items, timeline and attachments.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Customers
-- -----------------------------------------------------------------------------

create table public.customers (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    full_name text not null check (char_length(full_name) between 1 and 120),
    email text check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    phone text check (phone ~ '^\+?[0-9 ().-]{7,20}$'),
    notes text check (char_length(notes) <= 2000),
    tags text[] not null default '{}' check (cardinality(tags) <= 20),
    email_opt_in boolean not null default true,
    sms_opt_in boolean not null default false,
    -- Customer object on the business's connected Stripe account (saved cards, receipts).
    stripe_customer_id text check (stripe_customer_id ~ '^cus_'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (business_id, id)
);

comment on table public.customers is 'A business''s customers. Scoped per business; the same person at two businesses is two rows.';

create unique index customers_business_email_key on public.customers (business_id, email) where email is not null;
create unique index customers_business_stripe_key on public.customers (business_id, stripe_customer_id) where stripe_customer_id is not null;
create index customers_business_name_idx on public.customers (business_id, lower(full_name));

create trigger customers_set_updated_at
    before update on public.customers
    for each row execute function private.set_updated_at();

create table public.customer_addresses (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null,
    customer_id uuid not null,
    label text check (char_length(label) <= 40),
    line1 text not null check (char_length(line1) between 3 and 200),
    line2 text check (char_length(line2) <= 200),
    city text check (char_length(city) <= 100),
    region text check (char_length(region) <= 100),
    postal_code text check (char_length(postal_code) <= 20),
    country text not null default 'US' check (country ~ '^[A-Z]{2}$'),
    lat double precision check (lat between -90 and 90),
    lng double precision check (lng between -180 and 180),
    access_notes text check (char_length(access_notes) <= 500),
    is_primary boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (business_id, id),
    check ((lat is null) = (lng is null)),
    foreign key (business_id, customer_id) references public.customers (business_id, id) on delete cascade
);

comment on column public.customer_addresses.access_notes is 'Gate codes, dogs, where to park. Visible to the crew.';

create index customer_addresses_customer_idx on public.customer_addresses (business_id, customer_id);
create unique index customer_addresses_one_primary on public.customer_addresses (customer_id) where is_primary;

create trigger customer_addresses_set_updated_at
    before update on public.customer_addresses
    for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Recurring plans (weekly mows, monthly pool service…)
-- -----------------------------------------------------------------------------

create table public.recurring_series (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    customer_id uuid not null,
    address_id uuid,
    service_id uuid,
    assigned_member_id uuid,
    frequency public.recurrence_frequency not null,
    starts_on date not null,
    ends_on date,
    start_time time not null,
    duration_minutes integer not null check (duration_minutes between 5 and 1440),
    price_cents integer not null check (price_cents between 0 and 10000000),
    is_active boolean not null default true,
    -- Bookings have been generated through this date.
    generated_through date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (business_id, id),
    check (ends_on is null or ends_on >= starts_on),
    foreign key (business_id, customer_id) references public.customers (business_id, id) on delete cascade,
    foreign key (business_id, address_id) references public.customer_addresses (business_id, id) on delete set null (address_id),
    foreign key (business_id, service_id) references public.services (business_id, id) on delete set null (service_id),
    foreign key (business_id, assigned_member_id) references public.business_members (business_id, id) on delete set null (assigned_member_id)
);

create index recurring_series_customer_idx on public.recurring_series (business_id, customer_id);
create index recurring_series_address_idx on public.recurring_series (business_id, address_id);
create index recurring_series_service_idx on public.recurring_series (business_id, service_id);
create index recurring_series_member_idx on public.recurring_series (business_id, assigned_member_id);
create index recurring_series_due_idx on public.recurring_series (generated_through) where is_active;

create trigger recurring_series_set_updated_at
    before update on public.recurring_series
    for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Bookings
-- -----------------------------------------------------------------------------

create table public.bookings (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    reference text not null default private.booking_reference(),
    customer_id uuid not null,
    address_id uuid,
    assigned_member_id uuid,
    recurring_series_id uuid,

    status public.booking_status not null default 'requested',
    source public.booking_source not null default 'manual',
    scheduled_start timestamptz not null,
    scheduled_end timestamptz not null,
    scheduled_range tstzrange generated always as (tstzrange(scheduled_start, scheduled_end, '[)')) stored,
    -- A pending_payment booking holds its slot until this time.
    hold_expires_at timestamptz,

    -- Money (cents). Subtotal is maintained from booking_items; paid/refunded
    -- totals are maintained from payments. Clients can't write either.
    currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
    subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
    discount_cents integer not null default 0 check (discount_cents >= 0),
    tax_cents integer not null default 0 check (tax_cents >= 0),
    tip_cents integer not null default 0 check (tip_cents >= 0),
    total_cents integer generated always as (subtotal_cents - discount_cents + tax_cents + tip_cents) stored,
    deposit_due_cents integer not null default 0 check (deposit_due_cents >= 0),
    deposit_paid_cents integer not null default 0 check (deposit_paid_cents >= 0),
    amount_paid_cents integer not null default 0 check (amount_paid_cents >= 0),
    amount_refunded_cents integer not null default 0 check (amount_refunded_cents >= 0),
    balance_due_cents integer generated always as (
        subtotal_cents - discount_cents + tax_cents + tip_cents - amount_paid_cents + amount_refunded_cents
    ) stored,

    customer_notes text check (char_length(customer_notes) <= 2000),
    internal_notes text check (char_length(internal_notes) <= 5000),
    -- Unguessable link for the customer's "manage booking / pay balance" page.
    public_token text not null unique default private.random_token(),

    confirmed_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    cancelled_at timestamptz,
    cancellation_reason text check (char_length(cancellation_reason) <= 500),
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (business_id, id),
    unique (business_id, reference),
    check (scheduled_end > scheduled_start),
    check (discount_cents <= subtotal_cents),
    check (amount_refunded_cents <= amount_paid_cents),
    check (status <> 'pending_payment' or hold_expires_at is not null),
    foreign key (business_id, customer_id) references public.customers (business_id, id) on delete restrict,
    foreign key (business_id, address_id) references public.customer_addresses (business_id, id) on delete set null (address_id),
    foreign key (business_id, assigned_member_id) references public.business_members (business_id, id) on delete set null (assigned_member_id),
    foreign key (business_id, recurring_series_id) references public.recurring_series (business_id, id) on delete set null (recurring_series_id),

    -- Nobody can be in two places at once. Enforced by Postgres itself, so no
    -- race between two customers grabbing the same slot can double-book a crew member.
    constraint bookings_no_overlap_per_member exclude using gist (
        assigned_member_id with =,
        scheduled_range with &&
    ) where (status in ('pending_payment', 'requested', 'confirmed', 'in_progress'))
);

comment on table public.bookings is 'A scheduled job for a customer. Money columns are maintained by triggers.';
comment on column public.bookings.reference is 'Short code customers can quote, unique per business.';

create index bookings_business_start_idx on public.bookings (business_id, scheduled_start);
create index bookings_business_range_idx on public.bookings using gist (business_id, scheduled_range)
    where status in ('pending_payment', 'requested', 'confirmed', 'in_progress');
create index bookings_member_start_idx on public.bookings (business_id, assigned_member_id, scheduled_start);
create index bookings_customer_idx on public.bookings (business_id, customer_id, scheduled_start desc);
create index bookings_address_idx on public.bookings (business_id, address_id);
create index bookings_series_idx on public.bookings (business_id, recurring_series_id);
create index bookings_created_by_idx on public.bookings (created_by);
create index bookings_expiring_holds_idx on public.bookings (hold_expires_at) where status = 'pending_payment';

create trigger bookings_set_updated_at
    before update on public.bookings
    for each row execute function private.set_updated_at();

-- Enforces the booking lifecycle and stamps the matching timestamp.
create function private.booking_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
        if not (
            (old.status = 'pending_payment' and new.status in ('requested', 'confirmed', 'cancelled'))
            or (old.status = 'requested' and new.status in ('confirmed', 'cancelled'))
            or (old.status = 'confirmed' and new.status in ('requested', 'in_progress', 'completed', 'cancelled', 'no_show'))
            or (old.status = 'in_progress' and new.status in ('confirmed', 'completed', 'cancelled'))
        ) then
            raise exception 'Invalid booking status change: % -> %', old.status, new.status
                using errcode = 'check_violation';
        end if;
    end if;

    if tg_op = 'INSERT' or new.status is distinct from old.status then
        case new.status
            when 'confirmed' then new.confirmed_at := coalesce(new.confirmed_at, now());
            when 'in_progress' then new.started_at := coalesce(new.started_at, now());
            when 'completed' then new.completed_at := coalesce(new.completed_at, now());
            when 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now());
            else null;
        end case;
        if new.status <> 'pending_payment' then
            new.hold_expires_at := null;
        end if;
    end if;

    return new;
end;
$$;

create trigger bookings_status_guard
    before insert or update of status on public.bookings
    for each row execute function private.booking_status_guard();

-- -----------------------------------------------------------------------------
-- Booking line items (price snapshot at the time of booking)
-- -----------------------------------------------------------------------------

create table public.booking_items (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null,
    booking_id uuid not null,
    service_id uuid,
    name text not null check (char_length(name) between 1 and 120),
    description text check (char_length(description) <= 500),
    quantity integer not null default 1 check (quantity between 1 and 1000),
    unit_price_cents integer not null check (unit_price_cents between 0 and 10000000),
    line_total_cents integer generated always as (quantity * unit_price_cents) stored,
    duration_minutes integer check (duration_minutes between 0 and 1440),
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (business_id, booking_id) references public.bookings (business_id, id) on delete cascade,
    foreign key (business_id, service_id) references public.services (business_id, id) on delete set null (service_id)
);

create index booking_items_booking_idx on public.booking_items (business_id, booking_id);
create index booking_items_service_idx on public.booking_items (business_id, service_id);

create trigger booking_items_set_updated_at
    before update on public.booking_items
    for each row execute function private.set_updated_at();

create function private.refresh_booking_subtotal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_booking_id uuid := coalesce(new.booking_id, old.booking_id);
begin
    update public.bookings b
    set subtotal_cents = coalesce((
        select sum(i.line_total_cents) from public.booking_items i where i.booking_id = v_booking_id
    ), 0)
    where b.id = v_booking_id;
    return null;
end;
$$;

create trigger booking_items_refresh_subtotal
    after insert or update of quantity, unit_price_cents or delete on public.booking_items
    for each row execute function private.refresh_booking_subtotal();

-- -----------------------------------------------------------------------------
-- Booking timeline (append-only)
-- -----------------------------------------------------------------------------

create table public.booking_events (
    id bigint generated always as identity primary key,
    business_id uuid not null,
    booking_id uuid not null,
    event_type text not null check (event_type in ('created', 'status_changed', 'rescheduled', 'reassigned', 'payment', 'note')),
    from_status public.booking_status,
    to_status public.booking_status,
    -- Who did it (NULL for the system, webhooks or customers). Not a foreign key,
    -- so the history survives a user being deleted.
    actor_id uuid,
    data jsonb not null default '{}',
    created_at timestamptz not null default now(),
    foreign key (business_id, booking_id) references public.bookings (business_id, id) on delete cascade
);

create index booking_events_booking_idx on public.booking_events (business_id, booking_id, created_at);

create function private.log_booking_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_actor uuid := (select auth.uid());
begin
    if tg_op = 'INSERT' then
        insert into public.booking_events (business_id, booking_id, event_type, to_status, actor_id, data)
        values (new.business_id, new.id, 'created', new.status, v_actor, jsonb_build_object('source', new.source));
        return null;
    end if;

    if new.status is distinct from old.status then
        insert into public.booking_events (business_id, booking_id, event_type, from_status, to_status, actor_id, data)
        values (new.business_id, new.id, 'status_changed', old.status, new.status, v_actor,
                case when new.cancellation_reason is not null and new.status = 'cancelled'
                     then jsonb_build_object('reason', new.cancellation_reason) else '{}' end);
    end if;

    if new.scheduled_start is distinct from old.scheduled_start or new.scheduled_end is distinct from old.scheduled_end then
        insert into public.booking_events (business_id, booking_id, event_type, actor_id, data)
        values (new.business_id, new.id, 'rescheduled', v_actor, jsonb_build_object(
            'from_start', old.scheduled_start, 'from_end', old.scheduled_end,
            'to_start', new.scheduled_start, 'to_end', new.scheduled_end));
    end if;

    if new.assigned_member_id is distinct from old.assigned_member_id then
        insert into public.booking_events (business_id, booking_id, event_type, actor_id, data)
        values (new.business_id, new.id, 'reassigned', v_actor, jsonb_build_object(
            'from_member_id', old.assigned_member_id, 'to_member_id', new.assigned_member_id));
    end if;

    return null;
end;
$$;

create trigger bookings_log_event
    after insert or update of status, scheduled_start, scheduled_end, assigned_member_id on public.bookings
    for each row execute function private.log_booking_event();

-- -----------------------------------------------------------------------------
-- Job photos & documents (files live in the private "job-files" storage bucket)
-- -----------------------------------------------------------------------------

create table public.booking_attachments (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null,
    booking_id uuid not null,
    kind public.attachment_kind not null default 'photo',
    -- <business_id>/<booking_id>/<file>, mirrored by the storage policies.
    storage_path text not null unique check (split_part(storage_path, '/', 1) = business_id::text),
    caption text check (char_length(caption) <= 300),
    content_type text check (char_length(content_type) <= 100),
    size_bytes integer check (size_bytes between 0 and 52428800),
    uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    foreign key (business_id, booking_id) references public.bookings (business_id, id) on delete cascade
);

create index booking_attachments_booking_idx on public.booking_attachments (business_id, booking_id);
create index booking_attachments_uploaded_by_idx on public.booking_attachments (uploaded_by);

-- -----------------------------------------------------------------------------
-- RLS
--
-- The whole team (including crew) can read customers and jobs, since crew need
-- addresses and notes in the field. Only owners and admins change them
-- directly; crew update job progress through public.update_job_status().
-- -----------------------------------------------------------------------------

alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.recurring_series enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
alter table public.booking_events enable row level security;
alter table public.booking_attachments enable row level security;

create policy "Members read customers"
    on public.customers for select to authenticated
    using (business_id in (select private.member_business_ids()));
create policy "Owners and admins insert customers"
    on public.customers for insert to authenticated
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins update customers"
    on public.customers for update to authenticated
    using (business_id in (select private.managed_business_ids()))
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins delete customers"
    on public.customers for delete to authenticated
    using (business_id in (select private.managed_business_ids()));

create policy "Members read addresses"
    on public.customer_addresses for select to authenticated
    using (business_id in (select private.member_business_ids()));
create policy "Owners and admins insert addresses"
    on public.customer_addresses for insert to authenticated
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins update addresses"
    on public.customer_addresses for update to authenticated
    using (business_id in (select private.managed_business_ids()))
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins delete addresses"
    on public.customer_addresses for delete to authenticated
    using (business_id in (select private.managed_business_ids()));

create policy "Members read recurring plans"
    on public.recurring_series for select to authenticated
    using (business_id in (select private.member_business_ids()));
create policy "Owners and admins insert recurring plans"
    on public.recurring_series for insert to authenticated
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins update recurring plans"
    on public.recurring_series for update to authenticated
    using (business_id in (select private.managed_business_ids()))
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins delete recurring plans"
    on public.recurring_series for delete to authenticated
    using (business_id in (select private.managed_business_ids()));

create policy "Members read bookings"
    on public.bookings for select to authenticated
    using (business_id in (select private.member_business_ids()));
create policy "Owners and admins insert bookings"
    on public.bookings for insert to authenticated
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins update bookings"
    on public.bookings for update to authenticated
    using (business_id in (select private.managed_business_ids()))
    with check (business_id in (select private.managed_business_ids()));

create policy "Members read booking items"
    on public.booking_items for select to authenticated
    using (business_id in (select private.member_business_ids()));
create policy "Owners and admins insert booking items"
    on public.booking_items for insert to authenticated
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins update booking items"
    on public.booking_items for update to authenticated
    using (business_id in (select private.managed_business_ids()))
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins delete booking items"
    on public.booking_items for delete to authenticated
    using (business_id in (select private.managed_business_ids()));

create policy "Members read booking history"
    on public.booking_events for select to authenticated
    using (business_id in (select private.member_business_ids()));

create policy "Members read attachments"
    on public.booking_attachments for select to authenticated
    using (business_id in (select private.member_business_ids()));
create policy "Members add attachments"
    on public.booking_attachments for insert to authenticated
    with check (
        business_id in (select private.member_business_ids())
        and uploaded_by = (select auth.uid())
    );
create policy "Uploaders and managers delete attachments"
    on public.booking_attachments for delete to authenticated
    using (
        business_id in (select private.managed_business_ids())
        or (uploaded_by = (select auth.uid()) and business_id in (select private.member_business_ids()))
    );
