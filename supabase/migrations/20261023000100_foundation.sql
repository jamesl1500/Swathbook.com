-- =============================================================================
-- Swathbook schema · 1/6 · Foundation
--
-- Extensions, the private helper schema, shared enums, utility functions and
-- user profiles.
--
-- Conventions used across every migration:
--   * Money is integer cents (never floats). Currency is lowercase ISO-4217.
--   * Every tenant-owned row carries business_id. Child tables reference their
--     parent with a composite (business_id, id) foreign key, so a row can never
--     point at another tenant's data, even through a bug in application code.
--   * RLS is on for every table. anon gets no table access at all; the public
--     booking page reads through a few SECURITY DEFINER functions instead.
--   * Writes that must be trusted (payments, Stripe state) are service-role only.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
comment on schema private is 'Internal helpers, trigger functions and RLS predicates. Not exposed through the Data API.';
revoke all on schema private from public;
-- RLS policies run as the calling role, so it needs to reach the helper functions.
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type public.member_role as enum ('owner', 'admin', 'crew');
create type public.member_status as enum ('active', 'suspended');

create type public.price_type as enum ('fixed', 'starting_at', 'quote');
create type public.deposit_type as enum ('none', 'percent', 'fixed');
create type public.refund_policy as enum ('refundable', 'refundable_before_window', 'non_refundable');

create type public.booking_status as enum (
    'pending_payment', -- holding a slot while the customer pays the deposit
    'requested',       -- waiting for the business to accept
    'confirmed',
    'in_progress',
    'completed',
    'cancelled',
    'no_show'
);
create type public.booking_source as enum ('booking_page', 'manual', 'recurring', 'import');
create type public.recurrence_frequency as enum ('weekly', 'biweekly', 'every_4_weeks', 'monthly');
create type public.attachment_kind as enum ('photo', 'document');

create type public.payment_kind as enum ('deposit', 'balance', 'full', 'tip');
create type public.payment_status as enum (
    'requires_payment', 'processing', 'succeeded', 'failed', 'canceled', 'refunded', 'partially_refunded'
);
create type public.refund_status as enum ('pending', 'succeeded', 'failed', 'canceled');
create type public.invoice_status as enum ('draft', 'open', 'paid', 'void', 'uncollectible');
create type public.subscription_plan as enum ('solo', 'crew', 'fleet');
create type public.subscription_status as enum (
    'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'
);

create type public.route_status as enum ('draft', 'optimized', 'in_progress', 'completed');
create type public.stop_status as enum ('pending', 'en_route', 'arrived', 'completed', 'skipped');

create type public.notification_channel as enum ('email', 'sms');
create type public.notification_status as enum ('queued', 'sent', 'delivered', 'failed', 'canceled');

-- -----------------------------------------------------------------------------
-- Utility functions
-- -----------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

-- 64 hex chars (~244 random bits) for unguessable customer-facing links.
create function private.random_token()
returns text
language sql
volatile
set search_path = ''
as $$
    select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

-- Short, human-friendly booking reference, e.g. "7K2F9QXA". Not a secret.
create function private.booking_reference()
returns text
language sql
volatile
set search_path = ''
as $$
    select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

create function private.sha256_hex(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
    select encode(sha256(convert_to(p_value, 'UTF8')), 'hex');
$$;

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------

create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    full_name text check (char_length(full_name) <= 120),
    phone text check (phone ~ '^\+?[0-9 ().-]{7,20}$'),
    avatar_path text check (char_length(avatar_path) <= 512),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Personal details for every signed-in user. Created automatically on signup.';

create trigger profiles_set_updated_at
    before update on public.profiles
    for each row execute function private.set_updated_at();

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, full_name)
    values (new.id, nullif(left(trim(new.raw_user_meta_data ->> 'full_name'), 120), ''))
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function private.handle_new_user();
