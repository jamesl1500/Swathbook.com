-- =============================================================================
-- Stripe Connect accounts record who created them
--
-- Each business has its own connected account (business_id is the primary key
-- and stripe_account_id is unique, so an account can't be shared). created_by
-- adds the person who set it up. Existing accounts are credited to the
-- business's owner, the only role allowed to create one.
-- =============================================================================

alter table public.stripe_connect_accounts
    add column if not exists created_by uuid references auth.users (id) on delete set null;

update public.stripe_connect_accounts sca
set created_by = b.owner_id
from public.businesses b
where b.id = sca.business_id and sca.created_by is null;

create index if not exists stripe_connect_accounts_created_by_idx
    on public.stripe_connect_accounts (created_by);

-- Rows written without a creator still point at a person.
create or replace function private.set_connect_account_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.created_by is null then
        select b.owner_id into new.created_by from public.businesses b where b.id = new.business_id;
    end if;
    return new;
end;
$$;

revoke all on function private.set_connect_account_creator() from public, anon, authenticated;

drop trigger if exists stripe_connect_accounts_set_creator on public.stripe_connect_accounts;
create trigger stripe_connect_accounts_set_creator
    before insert on public.stripe_connect_accounts
    for each row execute function private.set_connect_account_creator();

comment on table public.stripe_connect_accounts is
    'One Stripe Connect account per business, never shared between businesses. Updated from account webhooks.';
comment on column public.stripe_connect_accounts.created_by is
    'The person who created this connected account. Set to null if their login is later deleted.';
