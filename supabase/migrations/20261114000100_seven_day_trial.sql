-- =============================================================================
-- The free trial is now 7 days (was 14). Applies to businesses that finish
-- onboarding from now on; trials already running keep the end date they were
-- promised. Keep TRIAL_DAYS in apps/swathbook-web/src/libs/billing/plans.ts in step.
-- =============================================================================

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
