-- =============================================================================
-- Pricing moves to 1.25% of each customer payment
--
-- Swathbook no longer sells monthly plans. Its only charge is a 1.25%
-- application fee on deposits and balances customers pay through the booking
-- page (tips are fee-free); see apps/swathbook-web/src/libs/billing/fees.ts.
-- So:
--   * booking pages never pause for billing: business_has_access() is true
--     for every business (the callers still check is_published)
--   * teams have no seat limit: seat_limit() is NULL (unlimited)
--   * new businesses no longer start a trial
--
-- public.subscriptions stays, written by the Stripe webhook, so plans bought
-- before this change are still mirrored until they're cancelled. It no longer
-- affects access or seats.
-- =============================================================================

create or replace function private.business_has_access(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (select 1 from public.businesses b where b.id = p_business_id);
$$;

comment on function private.business_has_access(uuid) is
    'Always open for an existing business: pricing is a per-payment fee, so nothing lapses.';

create or replace function private.seat_limit(p_business_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
    select null::integer;
$$;

comment on function private.seat_limit(uuid) is 'NULL: every business can have as many team members as it needs.';

drop trigger if exists businesses_start_trial on public.businesses;
drop function if exists private.start_trial();

comment on column public.businesses.trial_ends_at is 'Unused since per-payment pricing (20261121). Kept for history.';
comment on table public.subscriptions is
    'Monthly plans from before per-payment pricing, mirrored by the Stripe webhook. No longer gates access or seats.';
