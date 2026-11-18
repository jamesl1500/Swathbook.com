-- Rain days and property notes (20261119000100_rain_days_property_notes.sql).
begin;
\set QUIET 1
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir _helpers.psql

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com', now(), '{}'),
    ('00000000-0000-0000-0000-0000000000a2', 'crew@example.com', now(), '{}'),
    ('00000000-0000-0000-0000-0000000000a3', 'rival@example.com', now(), '{}');

insert into public.businesses (id, owner_id, name, slug, trade, timezone, is_published, booking_lead_time_minutes, buffer_minutes, onboarding_completed_at)
values
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Green Acres', 'green-acres', 'lawn-care', 'America/Chicago', true, 0, 0, now()),
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a3', 'Rival Lawns', 'rival-lawns', 'lawn-care', 'America/Chicago', true, 0, 0, now());
insert into public.business_members (id, business_id, user_id, role, display_name)
values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'crew', 'Carl Crew');
insert into public.business_hours (business_id, weekday, opens_at, closes_at)
select '10000000-0000-0000-0000-000000000001', d, '08:00', '12:00' from generate_series(0, 6) d;

insert into public.services (id, business_id, name, price_type, price_cents, duration_minutes, weather_dependent) values
    ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Mow', 'fixed', 5000, 60, true),
    ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Gutter check', 'fixed', 3000, 60, false);

create function pg_temp.at(p_days integer, p_time time) returns timestamptz language sql as $$
    select (((now() at time zone 'America/Chicago')::date + p_days)::timestamp + p_time) at time zone 'America/Chicago';
$$;
create function pg_temp.day(p_days integer) returns date language sql as $$
    select (now() at time zone 'America/Chicago')::date + p_days;
$$;

-- Jobs: three mows on day 2 for Carl, one indoor job, one on day 3 already in Carl's 9am.
create function pg_temp.job(p_name text, p_service uuid, p_start timestamptz, p_member uuid, p_status public.booking_status default 'confirmed')
returns uuid language plpgsql as $$
declare v_customer uuid; v_booking uuid;
begin
    insert into public.customers (business_id, full_name, email) values ('10000000-0000-0000-0000-000000000001', p_name, lower(p_name) || '@example.com')
    returning id into v_customer;
    insert into public.bookings (business_id, customer_id, assigned_member_id, status, scheduled_start, scheduled_end)
    values ('10000000-0000-0000-0000-000000000001', v_customer, p_member, p_status, p_start, p_start + interval '1 hour')
    returning id into v_booking;
    insert into public.booking_items (business_id, booking_id, service_id, name, unit_price_cents, duration_minutes)
    values ('10000000-0000-0000-0000-000000000001', v_booking, p_service, 'item', 5000, 60);
    return v_booking;
end $$;

create temp table jobs (name text primary key, id uuid);
grant select on jobs to authenticated;
insert into jobs values
    ('ann', pg_temp.job('Ann', '50000000-0000-0000-0000-000000000001', pg_temp.at(2, '08:00'), '20000000-0000-0000-0000-000000000002')),
    ('bea', pg_temp.job('Bea', '50000000-0000-0000-0000-000000000001', pg_temp.at(2, '09:00'), '20000000-0000-0000-0000-000000000002')),
    ('cal', pg_temp.job('Cal', '50000000-0000-0000-0000-000000000001', pg_temp.at(2, '10:00'), '20000000-0000-0000-0000-000000000002')),
    ('dee', pg_temp.job('Dee', '50000000-0000-0000-0000-000000000002', pg_temp.at(2, '11:00'), '20000000-0000-0000-0000-000000000002')),
    ('eve', pg_temp.job('Eve', '50000000-0000-0000-0000-000000000001', pg_temp.at(3, '09:00'), '20000000-0000-0000-0000-000000000002')),
    ('fay', pg_temp.job('Fay', '50000000-0000-0000-0000-000000000001', pg_temp.at(2, '11:00'), null, 'cancelled'));

create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from jobs where name = p_name $$;

-- ---------------------------------------------------------------------------
-- Who may plan
-- ---------------------------------------------------------------------------
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a2');
select t.expect_error(format('select public.plan_rain_delay(%L, %L, %L)', '10000000-0000-0000-0000-000000000001', pg_temp.day(2), pg_temp.day(3)),
                      'not_allowed', 'crew can''t move a whole day');
select t.as_user('00000000-0000-0000-0000-0000000000a3');
select t.expect_error(format('select public.plan_rain_delay(%L, %L, %L)', '10000000-0000-0000-0000-000000000001', pg_temp.day(2), pg_temp.day(3)),
                      'not_allowed', 'nor can another business');

select t.as_user('00000000-0000-0000-0000-0000000000a1');
select t.expect_error(format('select public.plan_rain_delay(%L, %L, %L)', '10000000-0000-0000-0000-000000000001', pg_temp.day(2), pg_temp.day(2)),
                      'invalid_days', 'the new day must be another day');
select t.expect_error(format('select public.plan_rain_delay(%L, %L, %L)', '10000000-0000-0000-0000-000000000001', pg_temp.day(2), pg_temp.day(-1)),
                      'invalid_days', 'and not in the past');

-- ---------------------------------------------------------------------------
-- Preview: works out the moves, changes nothing
-- ---------------------------------------------------------------------------
create temp table preview as
select public.plan_rain_delay('10000000-0000-0000-0000-000000000001', pg_temp.day(2), pg_temp.day(3)) as result;
reset role;

select is((select jsonb_array_length(result -> 'moves') from preview), 3, 'the three mows move; the gutter check and the cancelled job stay');
select is((select result -> 'rain_delay_id' from preview), 'null'::jsonb, 'a preview makes no rain delay');
select is((select scheduled_start from public.bookings where id = pg_temp.id('ann')), pg_temp.at(2, '08:00'), 'and moves nothing');
select is((select string_agg(distinct template, ',') from public.notifications where business_id = '10000000-0000-0000-0000-000000000001' and template in ('booking.rain_delay', 'booking.rescheduled')), null, 'or emails anyone');

create function pg_temp.move(p_result jsonb, p_name text) returns jsonb language sql as $$
    select m from jsonb_array_elements(p_result -> 'moves') m where (m ->> 'booking_id')::uuid = pg_temp.id(p_name);
$$;
select is((pg_temp.move((select result from preview), 'ann') ->> 'to_start')::timestamptz, pg_temp.at(3, '08:00'), 'Ann keeps her time');
-- Eve already has Carl at 9am on day 3, so Bea goes to Carl's closest open time, or to the owner at 9.
select is((pg_temp.move((select result from preview), 'bea') ->> 'reassigned')::boolean, false, 'Bea keeps Carl');
select is((pg_temp.move((select result from preview), 'bea') ->> 'to_start')::timestamptz, pg_temp.at(3, '10:00'), 'at his closest open time');
select is((pg_temp.move((select result from preview), 'cal') ->> 'to_start')::timestamptz, pg_temp.at(3, '11:00'), 'Cal follows on after Bea');

-- ---------------------------------------------------------------------------
-- Apply: moves them, one rain email each, no generic reschedule email
-- ---------------------------------------------------------------------------
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a1');
create temp table applied as
select public.plan_rain_delay('10000000-0000-0000-0000-000000000001', pg_temp.day(2), pg_temp.day(3), array[pg_temp.id('cal')],
                              true, '{"chance": 80, "summary": "Thunderstorms"}') as result;
reset role;

select is((select jsonb_array_length(result -> 'moves') from applied), 2, 'skipped jobs stay put');
select is((select scheduled_start from public.bookings where id = pg_temp.id('ann')), pg_temp.at(3, '08:00'), 'Ann moved');
select is((select scheduled_start from public.bookings where id = pg_temp.id('cal')), pg_temp.at(2, '10:00'), 'Cal was skipped');
select isnt((select rain_delay_id from public.bookings where id = pg_temp.id('ann')), null, 'moved jobs remember the rain delay');
select is((select (moved_count, left_count, forecast ->> 'summary')::text from public.rain_delays where business_id = '10000000-0000-0000-0000-000000000001'), '(2,0,Thunderstorms)', 'the day is recorded');
select is((select count(*)::int from public.notifications where business_id = '10000000-0000-0000-0000-000000000001' and template = 'booking.rain_delay' and status = 'queued'), 2, 'each moved customer gets the rain email');
select is((select count(*)::int from public.notifications where business_id = '10000000-0000-0000-0000-000000000001' and template = 'booking.rescheduled' and status = 'queued'), 0, 'and not the generic one too');
select ok((select payload ? 'previous_start' and payload ->> 'rain_date' = pg_temp.day(2)::text
           from public.notifications where template = 'booking.rain_delay' and booking_id = pg_temp.id('ann')), 'the email knows the old time and the rain day');

-- A full day with no room: what doesn't fit is reported, not dropped.
update public.business_hours set closes_at = '08:30' where business_id = '10000000-0000-0000-0000-000000000001';
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a1');
create temp table crowded as
select public.plan_rain_delay('10000000-0000-0000-0000-000000000001', pg_temp.day(2), pg_temp.day(4)) as result;
reset role;
select ok((select jsonb_array_length(result -> 'unplaced') >= 1 from crowded), 'jobs that don''t fit are listed as unplaced');

-- ---------------------------------------------------------------------------
-- Property notes
-- ---------------------------------------------------------------------------
insert into public.customer_addresses (id, business_id, customer_id, line1, lat, lng)
select '60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', customer_id, '1 Elm St', 30.27, -97.74
from public.bookings where id = pg_temp.id('ann');

set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a2');
select public.save_property_notes('60000000-0000-0000-0000-000000000001', ' 4321# ', 'Two friendly labs', 'Park on the street',
                                  '{"markers": [{"kind": "gate", "label": "Side gate", "lat": 30.27, "lng": -97.74}], "areas": []}');
reset role;
select is((select (gate_code, pets, access_notes)::text from public.customer_addresses where id = '60000000-0000-0000-0000-000000000001'),
          '(4321#,"Two friendly labs","Park on the street")', 'crew can update the property notes');
select is((select property_map -> 'markers' -> 0 ->> 'label' from public.customer_addresses where id = '60000000-0000-0000-0000-000000000001'),
          'Side gate', 'and the map');

set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a3');
select t.expect_error($$select public.save_property_notes('60000000-0000-0000-0000-000000000001', '1', null, null, null)$$,
                      'address_not_found', 'another business can''t');
select t.as_user('00000000-0000-0000-0000-0000000000a2');
select t.expect_error($$select public.save_property_notes('60000000-0000-0000-0000-000000000001', repeat('9', 41), null, null, null)$$,
                      'notes_too_long', 'gate codes are short');
select t.expect_error($$select public.save_property_notes('60000000-0000-0000-0000-000000000001', null, null, null, '[]')$$,
                      'invalid_property_map', 'the map is an object');
update public.customer_addresses set line1 = '2 Oak St' where id = '60000000-0000-0000-0000-000000000001';
reset role;
select is((select line1 from public.customer_addresses where id = '60000000-0000-0000-0000-000000000001'), '1 Elm St',
          'crew still can''t change the address itself');

select * from finish();
rollback;
