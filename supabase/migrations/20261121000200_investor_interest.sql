-- =============================================================================
-- Investor interest
--
-- The public /investors page lets people register interest in funding
-- Swathbook. Rows are written by the server action with the service role
-- (after an IP rate limit) and read in the staff-only /admin/investors inbox.
-- Nobody else can read or write them.
--
-- New interest is emailed to the team by the minute cron (see
-- libs/investors.ts), which stamps team_notified_at.
-- =============================================================================

create type public.investor_type as enum ('angel', 'fund', 'family_office', 'strategic', 'other');
create type public.investor_check_size as enum ('under_25k', '25k_100k', '100k_250k', '250k_plus', 'not_sure');
create type public.investor_status as enum ('new', 'contacted', 'meeting', 'committed', 'passed');

create table public.investor_interest (
    id uuid primary key default gen_random_uuid(),
    full_name text not null check (char_length(full_name) between 2 and 120),
    email text not null check (char_length(email) <= 320 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    firm text check (char_length(firm) <= 160),
    investor_type public.investor_type not null,
    check_size public.investor_check_size not null default 'not_sure',
    accredited boolean not null default false,
    message text check (char_length(message) <= 4000),
    status public.investor_status not null default 'new',
    notes text check (char_length(notes) <= 4000),
    team_notified_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.investor_interest is 'People interested in investing, from /investors. Service role only.';

create index investor_interest_created_idx on public.investor_interest (created_at desc);
create index investor_interest_unnotified_idx on public.investor_interest (created_at) where team_notified_at is null;

create trigger investor_interest_set_updated_at
    before update on public.investor_interest
    for each row execute function private.set_updated_at();

alter table public.investor_interest enable row level security;
revoke all on public.investor_interest from anon, authenticated;
grant all on public.investor_interest to service_role;
