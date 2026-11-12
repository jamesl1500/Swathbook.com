-- Customer app: search and signed-in customers' own bookings (20261110000100_customer_app.sql).
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

-- Two owners, a customer with a confirmed email, one whose email isn't confirmed
-- (but matches a booking), and a stranger.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000000a1', 'owner1@example.com', now(), '{}'),
    ('00000000-0000-0000-0000-0000000000a2', 'owner2@example.com', now(), '{}'),
    ('00000000-0000-0000-0000-0000000000c1', 'Cara@Example.com', now(), '{"full_name": "Cara Profile"}'),
    ('00000000-0000-0000-0000-0000000000c2', 'dan@example.com', null, '{}'),
    ('00000000-0000-0000-0000-0000000000c3', 'stranger@example.com', now(), '{}');

insert into public.businesses (id, owner_id, name, slug, trade, timezone, is_published, booking_lead_time_minutes, buffer_minutes,
                               cancellation_window_hours, service_area, onboarding_completed_at)
values
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Greenline Lawn', 'greenline', 'lawn-care',
     'America/Chicago', true, 0, 0, 24, 'Austin, TX', now()),
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a2', 'Brightside Wash', 'brightside', 'pressure-washing',
     'America/Chicago', true, 0, 0, 24, 'Round Rock, TX', now());
-- Unpublished, and published-but-no-services: neither should be searchable.
insert into public.businesses (id, owner_id, name, slug, trade, timezone, is_published, onboarding_completed_at)
values ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'Hidden Lawn 100%', 'hidden-lawn', 'lawn-care',
        'America/Chicago', false, now());

insert into public.business_hours (business_id, weekday, opens_at, closes_at)
select b, d, '00:00', '23:59'
from unnest(array['10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002']::uuid[]) b, generate_series(0, 6) d;
insert into public.services (id, business_id, name, price_type, price_cents, duration_minutes) values
    ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Mow, edge & blow', 'fixed', 4500, 60),
    ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Garden design', 'quote', 0, 60),
    ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Driveway wash', 'fixed', 14900, 60),
    ('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', 'Secret mow', 'fixed', 1000, 60);

-- Cara books both businesses (once with different letter case); Dan books one.
create temp table cara1 as
select * from public.create_booking('10000000-0000-0000-0000-000000000001', array['50000000-0000-0000-0000-000000000001']::uuid[],
    date_trunc('hour', now()) + interval '3 days', '{"full_name":"Cara Customer","email":"cara@example.com","phone":"512-555-0101"}',
    '{"line1":"1 Elm St","city":"Austin","region":"TX","postal_code":"78701"}');
create temp table cara2 as
select * from public.create_booking('10000000-0000-0000-0000-000000000002', array['50000000-0000-0000-0000-000000000003']::uuid[],
    date_trunc('hour', now()) + interval '4 days', '{"full_name":"Cara Customer","email":"CARA@example.com"}', '{"line1":"1 Elm St"}');
create temp table dan1 as
select * from public.create_booking('10000000-0000-0000-0000-000000000001', array['50000000-0000-0000-0000-000000000001']::uuid[],
    date_trunc('hour', now()) + interval '5 days', '{"full_name":"Dan","email":"dan@example.com"}', '{"line1":"2 Elm St"}');
-- Worked out up front: customers cannot read the bookings table directly.
create temp table moves as
select (select scheduled_start + interval '1 day' from public.bookings where id = (select booking_id from cara1)) as cara1_next;
grant select on cara1, cara2, dan1, moves to public;

-- Search assertions only look at this test's businesses (the local database may hold others).
create function t.mine(p_slugs text[]) returns text[] language sql as $$
    select coalesce(array_agg(s order by s), '{}') from unnest(p_slugs) s where s in ('greenline', 'brightside', 'hidden-lawn');
$$;
grant execute on function t.mine(text[]) to public;

-- ---------------------------------------------------------------------------
-- Search: anyone
-- ---------------------------------------------------------------------------
set role anon;

select t.ok((select t.mine(array_agg(s.slug)) = array['brightside', 'greenline']
             from generate_series(0, 40) p cross join lateral public.search_businesses(null, null, 50, p * 50) s),
            'an empty search lists every bookable business');
select t.ok(not exists (select 1 from public.search_businesses() where slug = 'hidden-lawn'), 'unpublished businesses are never listed');
select t.ok((select t.mine(array_agg(slug)) = array['greenline'] from public.search_businesses('lawn', null, 50)), 'matches the trade, as words');
select t.ok((select t.mine(array_agg(slug)) = array['brightside'] from public.search_businesses('driveway', null, 50)), 'matches a service name');
select t.ok((select t.mine(array_agg(slug)) = array['brightside'] from public.search_businesses('round rock', null, 50)), 'matches the service area');
select t.ok((select t.mine(array_agg(s.slug)) = array['greenline']
             from generate_series(0, 40) p cross join lateral public.search_businesses(null, 'lawn-care', 50, p * 50) s), 'filters by trade');
select t.ok(not exists (select 1 from public.search_businesses('%', null, 50) where slug in ('greenline', 'brightside')),
            'a "%" is a literal, not a wildcard');
select t.ok((select from_price_cents = 4500 and service_count = 2 from public.search_businesses('greenline')),
            'lowest price ignores quoted services');
select t.ok((select count(*) = 1 and min(total_count) >= 2 from public.search_businesses(null, null, 1)), 'pages, with the full count');
select t.ok((select count(*) = 2 from public.business_trades() where trade in ('lawn-care', 'pressure-washing')),
            'trades with bookable businesses');
select t.expect_error('select public.my_bookings()', 'permission denied', 'anon has no bookings to read');
select t.expect_error(format('select public.cancel_my_booking(%L)', (select booking_id from cara1)), 'permission denied',
                      'anon cannot cancel');

reset role;

-- ---------------------------------------------------------------------------
-- My bookings: matched by confirmed email, across businesses
-- ---------------------------------------------------------------------------
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000c1');

select t.ok((select jsonb_array_length(public.my_bookings()) = 2), 'Cara sees her bookings at both businesses');
select t.ok((select public.my_bookings() -> 0 -> 'business' ->> 'slug' = 'greenline'), 'oldest first');
select t.ok((select public.my_bookings() -> 0 -> 'items' -> 0 ->> 'name' = 'Mow, edge & blow'), 'with what was booked');
select t.ok((select public.my_bookings() -> 0 -> 'address' ->> 'line1' = '1 Elm St'), 'and where');
select t.ok((select (public.my_bookings() -> 0 -> 'options' ->> 'can_cancel')::boolean), 'and what she can do');
select t.ok((select public.my_bookings() -> 0 -> 'business' ? 'base_address') is false, 'never the business''s private fields');
select t.ok((select public.my_booking((select booking_id from dan1)) is null), 'another customer''s booking is invisible');
select t.ok((select public.my_details() ->> 'full_name' = 'Cara Profile'), 'details prefer her profile name');
select t.ok((select public.my_details() -> 'address' ->> 'line1' = '1 Elm St'), 'and offer her last address');

select t.expect_error(format('select public.cancel_my_booking(%L)', (select booking_id from dan1)), 'booking_not_found',
                      'she cannot cancel someone else''s booking');
select t.expect_error(format('select public.reschedule_my_booking(%L, %L)', (select booking_id from dan1), now() + interval '6 days'),
                      'booking_not_found', 'or move it');
select t.ok((select count(*) = 0 from public.my_reschedule_slots((select booking_id from dan1))), 'or see times for it');

select t.ok((select count(*) > 0 from public.my_reschedule_slots((select booking_id from cara1), (now() + interval '3 days')::date, 2)),
            'she sees open times for her own booking');
select t.ok((select public.reschedule_my_booking((select booking_id from cara1), (select cara1_next from moves))
             = (select cara1_next from moves)), 'and moves it');
select t.ok((select public.cancel_my_booking((select booking_id from cara2), 'Plans changed') = 'requested'),
            'cancelling a confirmed booking asks the business');

-- Unconfirmed email: nothing, even though a booking uses that address.
select t.as_user('00000000-0000-0000-0000-0000000000c2');
select t.ok((select public.my_bookings() = '[]'::jsonb), 'an unconfirmed email sees no bookings');
select t.ok((select public.my_details() is null), 'and no details');

-- A stranger sees nothing.
select t.as_user('00000000-0000-0000-0000-0000000000c3');
select t.ok((select public.my_bookings() = '[]'::jsonb), 'a stranger sees no bookings');

reset role;

-- The reschedule and cancel really happened.
select is((select customer_reschedule_count from public.bookings where id = (select booking_id from cara1)), 1, 'reschedule recorded');
select ok((select cancel_requested_at is not null from public.bookings where id = (select booking_id from cara2)), 'cancel request recorded');

select * from finish();
rollback;
