-- =============================================================================
-- Swathbook schema · 2/6 · Tenancy
--
-- Businesses (tenants), their team, invitations, services and availability,
-- plus the RLS helper functions every later policy builds on.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Businesses
-- -----------------------------------------------------------------------------

create table public.businesses (
    id uuid primary key default gen_random_uuid(),
    -- RESTRICT: deleting the owner's login must not silently erase a business
    -- and its financial history. Transfer or archive first.
    owner_id uuid not null unique references auth.users (id) on delete restrict,

    -- Public profile
    name text not null check (char_length(name) between 2 and 80),
    slug text not null unique check (
        char_length(slug) between 3 and 40
        and slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'
    ),
    trade text not null check (char_length(trade) between 1 and 40),
    description text check (char_length(description) <= 1000),
    phone text check (phone ~ '^\+?[0-9 ().-]{7,20}$'),
    email text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    website_url text check (website_url ~* '^https?://' and char_length(website_url) <= 300),
    logo_path text check (char_length(logo_path) <= 512),
    cover_path text check (char_length(cover_path) <= 512),
    brand_color text check (brand_color ~* '^#[0-9a-f]{6}$'),
    timezone text not null default 'UTC',
    currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),

    -- Where the day starts and how far the business travels (private: never on the booking page)
    base_address text check (char_length(base_address) <= 200),
    base_lat double precision check (base_lat between -90 and 90),
    base_lng double precision check (base_lng between -180 and 180),
    service_radius_miles integer check (service_radius_miles between 1 and 200),

    -- Booking rules
    booking_lead_time_minutes integer not null default 120 check (booking_lead_time_minutes between 0 and 10080),
    booking_window_days integer not null default 60 check (booking_window_days between 1 and 365),
    slot_interval_minutes integer not null default 30 check (slot_interval_minutes in (10, 15, 20, 30, 45, 60, 90, 120)),
    buffer_minutes integer not null default 15 check (buffer_minutes between 0 and 240),
    auto_confirm boolean not null default true,
    cancellation_window_hours integer not null default 24 check (cancellation_window_hours between 0 and 720),
    deposit_refund_policy public.refund_policy not null default 'refundable_before_window',

    -- Customer notifications
    email_reminders_enabled boolean not null default true,
    sms_reminders_enabled boolean not null default false,
    reminder_hours_before integer not null default 24 check (reminder_hours_before between 1 and 168),

    -- Platform billing (Swathbook subscription). Managed by the server only.
    stripe_customer_id text unique check (stripe_customer_id ~ '^cus_'),
    next_invoice_number integer not null default 1001 check (next_invoice_number > 0),

    is_published boolean not null default false,
    onboarding_completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint businesses_coordinates_together check ((base_lat is null) = (base_lng is null))
);

comment on table public.businesses is 'A field service business (tenant). Public booking link: swathbook.com/<slug>.';
comment on column public.businesses.base_address is 'Private. Where routes start; never exposed on the booking page.';
comment on column public.businesses.stripe_customer_id is 'Customer on the Swathbook platform account, for subscription billing.';

create trigger businesses_set_updated_at
    before update on public.businesses
    for each row execute function private.set_updated_at();

create function private.validate_business()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    -- Raises "time zone ... not recognized" for anything Postgres can't resolve.
    perform now() at time zone new.timezone;
    return new;
end;
$$;

create trigger businesses_validate
    before insert or update of timezone on public.businesses
    for each row execute function private.validate_business();

-- -----------------------------------------------------------------------------
-- Team members
-- -----------------------------------------------------------------------------

create table public.business_members (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    role public.member_role not null default 'crew',
    status public.member_status not null default 'active',
    display_name text check (char_length(display_name) <= 80),
    calendar_color text check (calendar_color ~* '^#[0-9a-f]{6}$'),
    is_bookable boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (business_id, user_id),
    unique (business_id, id)
);

comment on table public.business_members is 'Who can access a business, and in what role. Exactly one owner per business.';
comment on column public.business_members.is_bookable is 'Can be assigned customer jobs (counts toward booking capacity).';

create unique index business_members_one_owner on public.business_members (business_id) where role = 'owner';
create index business_members_user_idx on public.business_members (user_id) include (business_id, role, status);

create trigger business_members_set_updated_at
    before update on public.business_members
    for each row execute function private.set_updated_at();

-- The owner is always a member.
create function private.add_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.business_members (business_id, user_id, role)
    values (new.id, new.owner_id, 'owner')
    on conflict (business_id, user_id) do update set role = 'owner', status = 'active';
    return new;
end;
$$;

create trigger businesses_add_owner_membership
    after insert on public.businesses
    for each row execute function private.add_owner_membership();

-- -----------------------------------------------------------------------------
-- RLS helpers
--
-- Policies use `business_id in (select private.member_business_ids())`. The
-- subquery runs once per statement (not per row), and SECURITY DEFINER lets it
-- read business_members without recursing into that table's own policies.
-- -----------------------------------------------------------------------------

create function private.member_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
    select business_id from public.business_members
    where user_id = (select auth.uid()) and status = 'active';
$$;

create function private.managed_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
    select business_id from public.business_members
    where user_id = (select auth.uid()) and status = 'active' and role in ('owner', 'admin');
$$;

create function private.owned_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
    select business_id from public.business_members
    where user_id = (select auth.uid()) and status = 'active' and role = 'owner';
$$;

-- The caller's own membership ids (one per business), for "assigned to me" checks.
create function private.current_member_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
    select id from public.business_members
    where user_id = (select auth.uid()) and status = 'active';
$$;

-- Everyone the caller works with, for reading teammates' profiles.
create function private.teammate_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
    select distinct teammate.user_id
    from public.business_members me
    join public.business_members teammate on teammate.business_id = me.business_id
    where me.user_id = (select auth.uid()) and me.status = 'active';
$$;

revoke all on function
    private.member_business_ids(), private.managed_business_ids(), private.owned_business_ids(),
    private.current_member_ids(), private.teammate_user_ids()
from public;
grant execute on function
    private.member_business_ids(), private.managed_business_ids(), private.owned_business_ids(),
    private.current_member_ids(), private.teammate_user_ids()
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Invitations
-- -----------------------------------------------------------------------------

create table public.business_invitations (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    role public.member_role not null default 'crew' check (role <> 'owner'),
    -- Only a SHA-256 of the token is stored; the raw token lives in the invite email.
    token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
    invited_by uuid references auth.users (id) on delete set null,
    expires_at timestamptz not null default now() + interval '7 days',
    accepted_at timestamptz,
    accepted_by uuid references auth.users (id) on delete set null,
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);

comment on table public.business_invitations is 'Pending team invites. Accept through public.accept_business_invitation().';

create unique index business_invitations_one_pending
    on public.business_invitations (business_id, email)
    where accepted_at is null and revoked_at is null;
create index business_invitations_invited_by_idx on public.business_invitations (invited_by);
create index business_invitations_accepted_by_idx on public.business_invitations (accepted_by);

-- -----------------------------------------------------------------------------
-- Services
-- -----------------------------------------------------------------------------

create table public.services (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    name text not null check (char_length(name) between 2 and 80),
    description text check (char_length(description) <= 500),
    price_type public.price_type not null default 'fixed',
    price_cents integer not null check (price_cents between 0 and 10000000),
    duration_minutes integer not null check (duration_minutes between 5 and 1440),
    deposit_type public.deposit_type not null default 'none',
    deposit_percent integer not null default 0 check (deposit_percent between 0 and 100),
    deposit_amount_cents integer not null default 0 check (deposit_amount_cents >= 0),
    is_active boolean not null default true,
    is_public boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (business_id, id),
    constraint services_deposit_consistent check (
        (deposit_type = 'none' and deposit_percent = 0 and deposit_amount_cents = 0)
        or (deposit_type = 'percent' and deposit_percent between 1 and 100 and deposit_amount_cents = 0)
        or (deposit_type = 'fixed' and deposit_amount_cents > 0 and deposit_percent = 0)
    )
);

comment on column public.services.is_public is 'Shown on the public booking page. Hidden services can still be booked manually.';

create index services_business_sort_idx on public.services (business_id, sort_order) where is_active;

create trigger services_set_updated_at
    before update on public.services
    for each row execute function private.set_updated_at();

-- Deposit for one unit of a service, in cents (never more than the price).
create function private.service_deposit_cents(p_service public.services)
returns integer
language sql
immutable
set search_path = ''
as $$
    select case p_service.deposit_type
        when 'percent' then round(p_service.price_cents * p_service.deposit_percent / 100.0)::integer
        when 'fixed' then least(p_service.deposit_amount_cents, p_service.price_cents)
        else 0
    end;
$$;

-- -----------------------------------------------------------------------------
-- Availability
-- -----------------------------------------------------------------------------

create table public.business_hours (
    business_id uuid not null references public.businesses (id) on delete cascade,
    weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday, matches extract(dow)
    opens_at time not null,
    closes_at time not null,
    primary key (business_id, weekday),
    check (closes_at > opens_at)
);

comment on table public.business_hours is 'Weekly working hours in the business''s local time zone.';

create table public.time_off (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    -- NULL = the whole business is closed (holiday, weather day).
    member_id uuid,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    reason text check (char_length(reason) <= 200),
    created_at timestamptz not null default now(),
    check (ends_at > starts_at),
    foreign key (business_id, member_id) references public.business_members (business_id, id) on delete cascade
);

create index time_off_business_range_idx on public.time_off using gist (business_id, tstzrange(starts_at, ends_at, '[)'));
create index time_off_member_idx on public.time_off (business_id, member_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_invitations enable row level security;
alter table public.services enable row level security;
alter table public.business_hours enable row level security;
alter table public.time_off enable row level security;

-- profiles
create policy "Users read their own and teammates' profiles"
    on public.profiles for select to authenticated
    using (id = (select auth.uid()) or id in (select private.teammate_user_ids()));

create policy "Users update their own profile"
    on public.profiles for update to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

-- businesses
create policy "Members read their businesses"
    on public.businesses for select to authenticated
    using (id in (select private.member_business_ids()));

create policy "Users create a business they own"
    on public.businesses for insert to authenticated
    with check (owner_id = (select auth.uid()));

create policy "Owners and admins update their business"
    on public.businesses for update to authenticated
    using (id in (select private.managed_business_ids()))
    with check (id in (select private.managed_business_ids()));

-- business_members
create policy "Members see their team"
    on public.business_members for select to authenticated
    using (business_id in (select private.member_business_ids()));

create policy "Owners and admins manage non-owner members"
    on public.business_members for update to authenticated
    using (role <> 'owner' and business_id in (select private.managed_business_ids()))
    with check (role <> 'owner' and business_id in (select private.managed_business_ids()));

create policy "Owners and admins remove non-owner members"
    on public.business_members for delete to authenticated
    using (role <> 'owner' and business_id in (select private.managed_business_ids()));

-- business_invitations
create policy "Owners and admins see invitations"
    on public.business_invitations for select to authenticated
    using (business_id in (select private.managed_business_ids()));

create policy "Owners and admins revoke invitations"
    on public.business_invitations for update to authenticated
    using (business_id in (select private.managed_business_ids()))
    with check (business_id in (select private.managed_business_ids()));

create policy "Owners and admins delete invitations"
    on public.business_invitations for delete to authenticated
    using (business_id in (select private.managed_business_ids()));

-- services, business_hours, time_off: whole team reads, owners/admins write
create policy "Members read services"
    on public.services for select to authenticated
    using (business_id in (select private.member_business_ids()));
create policy "Owners and admins insert services"
    on public.services for insert to authenticated
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins update services"
    on public.services for update to authenticated
    using (business_id in (select private.managed_business_ids()))
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins delete services"
    on public.services for delete to authenticated
    using (business_id in (select private.managed_business_ids()));

create policy "Members read hours"
    on public.business_hours for select to authenticated
    using (business_id in (select private.member_business_ids()));
create policy "Owners and admins insert hours"
    on public.business_hours for insert to authenticated
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins update hours"
    on public.business_hours for update to authenticated
    using (business_id in (select private.managed_business_ids()))
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins delete hours"
    on public.business_hours for delete to authenticated
    using (business_id in (select private.managed_business_ids()));

create policy "Members read time off"
    on public.time_off for select to authenticated
    using (business_id in (select private.member_business_ids()));
create policy "Owners and admins insert time off"
    on public.time_off for insert to authenticated
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins update time off"
    on public.time_off for update to authenticated
    using (business_id in (select private.managed_business_ids()))
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins delete time off"
    on public.time_off for delete to authenticated
    using (business_id in (select private.managed_business_ids()));
