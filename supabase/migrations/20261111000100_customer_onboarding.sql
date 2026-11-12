-- =============================================================================
-- Customer app onboarding: a customer's home address and whether they've
-- finished setting up their account.
--
-- Kept out of public.profiles on purpose: teammates can read each other's
-- profiles, and a customer's home address is nobody's business but theirs.
-- Writes go through save_my_details() / finish_my_setup(), which validate.
-- =============================================================================

create table public.customer_profiles (
    user_id uuid primary key references auth.users (id) on delete cascade,
    address_line1 text check (char_length(address_line1) between 3 and 200),
    address_line2 text check (char_length(address_line2) <= 200),
    address_city text check (char_length(address_city) <= 100),
    address_region text check (char_length(address_region) <= 100),
    address_postal_code text check (char_length(address_postal_code) <= 20),
    -- Set when they finish (or skip) setup in the customer app.
    onboarded_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.customer_profiles is
    'Customer app details for a login: home address (prefills bookings) and onboarding state. Private to the user.';

create trigger customer_profiles_set_updated_at
    before update on public.customer_profiles
    for each row execute function private.set_updated_at();

alter table public.customer_profiles enable row level security;

create policy "Users read their own customer profile"
    on public.customer_profiles for select to authenticated
    using (user_id = (select auth.uid()));

revoke all on public.customer_profiles from anon, authenticated;
grant select on public.customer_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- my_details: now also the home address, onboarding state and how many
-- bookings this email already has (the app says "we found 3 bookings").
-- -----------------------------------------------------------------------------

create or replace function public.my_details()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    with me as (select (select private.current_customer_email()) as email, (select auth.uid()) as uid),
    latest_customer as (
        select c.full_name, c.phone
        from public.customers c, me
        where c.email = me.email
        order by c.updated_at desc
        limit 1
    ),
    latest_address as (
        select a.line1, a.line2, a.city, a.region, a.postal_code
        from public.customers c
        cross join me
        join public.bookings bk on bk.business_id = c.business_id and bk.customer_id = c.id
        join public.customer_addresses a on a.id = bk.address_id
        where c.email = me.email
        order by bk.created_at desc
        limit 1
    ),
    home as (
        select cp.address_line1 as line1, cp.address_line2 as line2, cp.address_city as city,
               cp.address_region as region, cp.address_postal_code as postal_code
        from public.customer_profiles cp, me
        where cp.user_id = me.uid and cp.address_line1 is not null
    )
    select jsonb_build_object(
        'email', me.email,
        'full_name', coalesce(p.full_name, (select full_name from latest_customer)),
        'phone', coalesce(p.phone, (select phone from latest_customer)),
        -- Best address to prefill a booking with: their saved home, else where they last booked.
        'address', coalesce((select to_jsonb(home) from home), (select to_jsonb(latest_address) from latest_address)),
        'home_address', (select to_jsonb(home) from home),
        'onboarded_at', (select cp.onboarded_at from public.customer_profiles cp where cp.user_id = me.uid),
        'booking_count', (
            select count(*)
            from public.customers c
            join public.bookings bk on bk.business_id = c.business_id and bk.customer_id = c.id
            where c.email = me.email
        )
    )
    from me
    left join public.profiles p on p.id = me.uid
    where me.email is not null;
$$;

-- -----------------------------------------------------------------------------
-- Writes
-- -----------------------------------------------------------------------------

-- Saves name, phone and (when given) home address in one go; returns my_details().
-- p_address: NULL leaves the address alone; an object with an empty line1 clears it.
create function public.save_my_details(
    p_full_name text,
    p_phone text default null,
    p_address jsonb default null,
    p_finish_setup boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_uid uuid := (select auth.uid());
    v_name text := nullif(left(trim(coalesce(p_full_name, '')), 120), '');
    v_phone text := nullif(trim(coalesce(p_phone, '')), '');
    v_line1 text := nullif(trim(coalesce(p_address ->> 'line1', '')), '');
begin
    if v_uid is null then
        raise exception 'not_signed_in' using errcode = '42501';
    end if;
    if v_name is null or char_length(v_name) < 2 then
        raise exception 'invalid_name' using errcode = '22023';
    end if;
    if v_phone is not null and v_phone !~ '^\+?[0-9 ().-]{7,20}$' then
        raise exception 'invalid_phone' using errcode = '22023';
    end if;
    if p_address is not null and v_line1 is not null and char_length(v_line1) < 3 then
        raise exception 'invalid_address' using errcode = '22023';
    end if;

    insert into public.profiles (id, full_name, phone)
    values (v_uid, v_name, v_phone)
    on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone;

    insert into public.customer_profiles as cp (user_id, onboarded_at)
    values (v_uid, case when p_finish_setup then now() end)
    on conflict (user_id) do update
        set onboarded_at = coalesce(cp.onboarded_at, excluded.onboarded_at);

    if p_address is not null then
        update public.customer_profiles
        set address_line1 = v_line1,
            address_line2 = case when v_line1 is null then null else nullif(left(trim(coalesce(p_address ->> 'line2', '')), 200), '') end,
            address_city = case when v_line1 is null then null else nullif(left(trim(coalesce(p_address ->> 'city', '')), 100), '') end,
            address_region = case when v_line1 is null then null else nullif(left(trim(coalesce(p_address ->> 'region', '')), 100), '') end,
            address_postal_code = case when v_line1 is null then null else nullif(left(trim(coalesce(p_address ->> 'postal_code', '')), 20), '') end
        where user_id = v_uid;
    end if;

    return public.my_details();
end;
$$;

-- "Skip for now": stop offering setup without saving anything.
create function public.finish_my_setup()
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.customer_profiles as cp (user_id, onboarded_at)
    select (select auth.uid()), now()
    where (select auth.uid()) is not null
    on conflict (user_id) do update set onboarded_at = coalesce(cp.onboarded_at, now());
$$;

revoke all on function public.save_my_details(text, text, jsonb, boolean), public.finish_my_setup()
from public, anon, authenticated;
grant execute on function public.save_my_details(text, text, jsonb, boolean), public.finish_my_setup()
to authenticated, service_role;
