-- Customer app onboarding: home address and setup state (20261111000100_customer_onboarding.sql).
begin;
\set QUIET 1
create extension if not exists pgtap with schema extensions;
select no_plan();

create schema t;
create function t.ok(p_cond boolean, p_msg text) returns text language sql as $$
    select extensions.ok(coalesce(p_cond, false), p_msg);
$$;
create function t.expect_error(p_sql text, p_like text, p_msg text) returns text language plpgsql as $$
begin
    begin
        execute p_sql;
    exception when others then
        if sqlerrm ilike '%' || p_like || '%' or sqlstate = p_like then
            return extensions.ok(true, p_msg);
        end if;
        return extensions.ok(false, p_msg) || E'\n' || extensions.diag(format('wrong error [%s] %s', sqlstate, sqlerrm));
    end;
    return extensions.ok(false, p_msg) || E'\n' || extensions.diag('statement succeeded');
end $$;
create function t.as_user(p_id uuid) returns void language sql as $$
    select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, false);
$$;
grant usage on schema t to public;
grant execute on all functions in schema t to public;

-- Cara (customer) also works for Owen's business, so they're teammates and can
-- read each other's profiles. Her home address must still stay private.
insert into auth.users (id, email, email_confirmed_at) values
    ('00000000-0000-0000-0000-0000000000a1', 'owen@example.com', now()),
    ('00000000-0000-0000-0000-0000000000c1', 'cara@example.com', now());
insert into public.businesses (id, owner_id, name, slug, trade, timezone, is_published, booking_lead_time_minutes, buffer_minutes, onboarding_completed_at)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Onboard Lawn', 'onboard-lawn', 'lawn-care',
        'America/Chicago', true, 0, 0, now());
insert into public.business_members (business_id, user_id, role)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'crew');
insert into public.business_hours (business_id, weekday, opens_at, closes_at)
select '10000000-0000-0000-0000-000000000001', d, '00:00', '23:59' from generate_series(0, 6) d;
insert into public.services (id, business_id, name, price_cents, duration_minutes)
values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Mow', 4500, 60);
-- A booking she made on the website before signing up.
select * from public.create_booking('10000000-0000-0000-0000-000000000001', array['50000000-0000-0000-0000-000000000001']::uuid[],
    date_trunc('hour', now()) + interval '3 days', '{"full_name":"Cara Web","email":"cara@example.com"}', '{"line1":"9 Old Rd"}');

set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000c1');

select t.ok((select public.my_details() ->> 'onboarded_at') is null, 'a new customer has not finished setup');
select t.ok((select (public.my_details() ->> 'booking_count')::int = 1), 'and we can tell her about her existing booking');
select t.ok((select public.my_details() -> 'address' ->> 'line1' = '9 Old Rd'), 'prefill falls back to where she last booked');

select t.expect_error('select public.save_my_details(''C'')', 'invalid_name', 'a name is required');
select t.expect_error('select public.save_my_details(''Cara'', ''call me'')', 'invalid_phone', 'phones are checked');
select t.expect_error('select public.save_my_details(''Cara'', null, ''{"line1":"x"}'')', 'invalid_address', 'addresses are checked');

select t.ok((select public.save_my_details('Cara Customer', '512-555-0101',
                '{"line1":"1 Elm St","city":"Austin","region":"TX","postal_code":"78701"}', true)
             -> 'home_address' ->> 'line1' = '1 Elm St'), 'she saves her details and home address');
select t.ok((select public.my_details() ->> 'full_name' = 'Cara Customer'), 'name saved');
select t.ok((select public.my_details() -> 'address' ->> 'line1' = '1 Elm St'), 'prefill now prefers her home address');
select t.ok((select public.my_details() ->> 'onboarded_at') is not null, 'setup is finished');

select t.ok((select public.save_my_details('Cara C', null, null) -> 'home_address' ->> 'line1' = '1 Elm St'),
            'saving without an address keeps the one she has');
select t.ok((select public.save_my_details('Cara C', null, '{"line1":""}') -> 'home_address') = 'null'::jsonb,
            'an empty address clears it');

-- Teammate can read her profile (existing behaviour) but not her customer profile.
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select t.ok((select count(*) = 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'), 'teammates still see each other''s profiles');
select t.ok((select count(*) = 0 from public.customer_profiles where user_id = '00000000-0000-0000-0000-0000000000c1'),
            'but never another person''s home address');
select t.expect_error('insert into public.customer_profiles (user_id) values (''00000000-0000-0000-0000-0000000000a1'')',
                      'permission denied', 'no direct writes; they go through save_my_details');
select t.ok((select public.my_details() ->> 'onboarded_at') is null, 'the owner hasn''t set up the customer app');
do $$ begin perform public.finish_my_setup(); end $$;
select t.ok((select public.my_details() ->> 'onboarded_at') is not null, 'skipping also finishes setup');

reset role;
set role anon;
select t.expect_error('select public.save_my_details(''Cara'')', 'permission denied', 'anon cannot save details');
select t.expect_error('select * from public.customer_profiles', 'permission denied', 'anon cannot read customer profiles');
reset role;

select * from finish();
rollback;
