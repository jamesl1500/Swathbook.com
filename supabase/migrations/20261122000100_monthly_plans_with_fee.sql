-- =============================================================================
-- Monthly plans are back, alongside the 1.25% payment fee
--
-- Pricing is now both: a monthly plan (Solo or Crew, after a 7-day free
-- trial) that covers running Swathbook, plus 1.25% of each deposit and
-- balance customers pay (apps/swathbook-web/src/libs/billing/fees.ts).
-- This undoes the access and seat changes in 20261121000100_fee_pricing.sql:
--   * booking pages pause again without a live trial or plan
--   * plans cap team seats again (trials get Crew's 5)
--   * finishing onboarding starts a 7-day trial again
-- Keep TRIAL_DAYS in apps/swathbook-web/src/libs/billing/plans.ts in step.
-- =============================================================================

-- Statuses that keep a booking page open. past_due gets Stripe's retry window.
create or replace function private.business_has_access(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (select 1 from public.businesses b where b.id = p_business_id and b.trial_ends_at > now())
        or exists (
            select 1 from public.subscriptions s
            where s.business_id = p_business_id and s.status in ('trialing', 'active', 'past_due')
        );
$$;

comment on function private.business_has_access(uuid) is 'Open during the free trial or while a plan is trialing, active or past_due.';

-- Team seats (including the owner). NULL means unlimited. Trials get Crew's limit.
create or replace function private.seat_limit(p_business_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
    select case s.plan
               when 'solo' then 1
               when 'crew' then 5
               when 'fleet' then null
           end
    from public.subscriptions s
    where s.business_id = p_business_id and s.status in ('trialing', 'active', 'past_due')
    union all
    select 5
    limit 1;
$$;

comment on function private.seat_limit(uuid) is 'Seats on the live plan (Solo 1, Crew 5, Fleet unlimited); 5 during the trial.';

create or replace function private.start_trial()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.onboarding_completed_at is not null and new.trial_ends_at is null then
        new.trial_ends_at := now() + interval '7 days';
    end if;
    return new;
end;
$$;

drop trigger if exists businesses_start_trial on public.businesses;
create trigger businesses_start_trial
    before insert or update of onboarding_completed_at on public.businesses
    for each row execute function private.start_trial();

-- Businesses that finished onboarding while there was no trial start one today.
update public.businesses set trial_ends_at = now() + interval '7 days'
where onboarding_completed_at is not null and trial_ends_at is null;

comment on column public.businesses.trial_ends_at is 'End of the free trial. Set when onboarding completes; not client-writable.';
comment on table public.subscriptions is
    'Monthly plans, written only by the Stripe webhook. A live plan (or the trial) keeps the booking page open and sets team seats.';
