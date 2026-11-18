-- Neighbor pricing, measured quotes and job reports
-- (20261118000100_neighbor_pricing_measured_quotes.sql, 20261118000200_job_reports.sql).
begin;
\set QUIET 1
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir _helpers.psql

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com', now(), '{}'),
    ('00000000-0000-0000-0000-0000000000a2', 'crew@example.com', now(), '{}'),
    ('00000000-0000-0000-0000-0000000000a3', 'rival@example.com', now(), '{}');

insert into public.businesses (id, owner_id, name, slug, trade, timezone, is_published, booking_lead_time_minutes, buffer_minutes,
                               onboarding_completed_at, neighbor_discount_percent, neighbor_radius_miles)
values
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Green Acres', 'green-acres', 'lawn-care',
     'America/Chicago', true, 0, 0, now(), 10, 0.5),
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a3', 'Rival Lawns', 'rival-lawns', 'lawn-care',
     'America/Chicago', true, 0, 0, now(), 0, 0.5);
insert into public.business_members (business_id, user_id, role, display_name)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'crew', 'Carl Crew');
insert into public.stripe_connect_accounts (business_id, stripe_account_id, charges_enabled)
values ('10000000-0000-0000-0000-000000000001', 'acct_green', true);

insert into public.business_hours (business_id, weekday, opens_at, closes_at)
select '10000000-0000-0000-0000-000000000001', d, '06:00', '20:00' from generate_series(0, 6) d;

insert into public.services (id, business_id, name, price_type, price_cents, duration_minutes, deposit_type, deposit_percent,
                             price_per_1000_sqft_cents, minutes_per_1000_sqft) values
    -- $50 mow, 20% deposit.
    ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Mow', 'fixed', 5000, 60, 'percent', 20, null, null),
    -- Aeration: $8 per 1,000 sq ft, never under $40 or 30 minutes; 4 minutes per 1,000 sq ft; 25% deposit.
    ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Aeration', 'starting_at', 4000, 30, 'percent', 25, 800, 4);

-- Local times on given days from now, in the business's time zone.
create function pg_temp.at(p_days integer, p_time time) returns timestamptz language sql as $$
    select (((now() at time zone 'America/Chicago')::date + p_days)::timestamp + p_time) at time zone 'America/Chicago';
$$;

create function pg_temp.book(p_service uuid, p_start timestamptz, p_email text, p_lat double precision, p_lng double precision,
                             p_measurement jsonb default null)
returns uuid language sql as $$
    select booking_id from public.create_booking('10000000-0000-0000-0000-000000000001', array[p_service],
        p_start, jsonb_build_object('full_name', 'Customer', 'email', p_email),
        jsonb_build_object('line1', p_email || ' St', 'lat', p_lat, 'lng', p_lng),
        null, 'booking_page', null, p_measurement);
$$;

-- ---------------------------------------------------------------------------
-- Neighbor pricing
-- ---------------------------------------------------------------------------

-- Ann's mow in two days, at 10am, confirmed (her deposit paid).
create temp table ann as select pg_temp.book('50000000-0000-0000-0000-000000000001', pg_temp.at(2, '10:00'), 'ann@example.com', 30.2672, -97.7431) as id;
grant select on ann to authenticated;
update public.bookings set status = 'confirmed' where id = (select id from ann);

create function pg_temp.day_discounts(p_lat double precision, p_lng double precision, p_days integer)
returns integer[] language sql as $$
    select array_agg(distinct s.neighbor_discount_percent order by s.neighbor_discount_percent)
    from public.get_available_slots('green-acres', array['50000000-0000-0000-0000-000000000001']::uuid[],
                                    ((now() at time zone 'America/Chicago')::date + p_days), 1, p_lat, p_lng) s;
$$;

-- About 0.2 miles from Ann.
select is(pg_temp.day_discounts(30.2702, -97.7431, 2), array[10], 'a neighbor sees every slot that day discounted');
select is(pg_temp.day_discounts(30.2702, -97.7431, 3), array[0], 'but not on days without work nearby');
select is(pg_temp.day_discounts(30.3172, -97.7431, 2), array[0], 'someone 3 miles away gets no discount');
select is(pg_temp.day_discounts(30.2672, -97.7431, 2), array[0], 'Ann''s own house doesn''t count as her neighbor');
select is((select array_agg(distinct neighbor_discount_percent) from public.get_available_slots(
              'green-acres', array['50000000-0000-0000-0000-000000000001']::uuid[], ((now() at time zone 'America/Chicago')::date + 2), 1)),
          array[0], 'no location, no discount');

-- Coordinates only count from the server: from the API, anyone could probe
-- points to find where customers have work booked.
set local role anon;
select is(pg_temp.day_discounts(30.2702, -97.7431, 2), array[0], 'visitors can''t probe neighbor days with their own coordinates');
reset role;
set local role authenticated;
select is(pg_temp.day_discounts(30.2702, -97.7431, 2), array[0], 'nor can signed-in users');
reset role;
set local role service_role;
select is(pg_temp.day_discounts(30.2702, -97.7431, 2), array[10], 'the server can');
reset role;

-- An unpaid hold nearby doesn't make a neighbor day.
update public.bookings set status = 'requested' where id = (select id from ann);
select is(pg_temp.day_discounts(30.2702, -97.7431, 2), array[10], 'requested jobs count');
update public.bookings set status = 'confirmed' where id = (select id from ann);

-- Bea books that day: 10% off, a smaller deposit, and the job goes to Ann's crew member
-- even though the other member has fewer jobs that day.
create temp table bea as select pg_temp.book('50000000-0000-0000-0000-000000000001', pg_temp.at(2, '13:00'), 'bea@example.com', 30.2702, -97.7431) as id;
select is((select discount_cents from public.bookings where id = (select id from bea)), 500, 'neighbor discount is 10% of the subtotal');
select is((select discount_reason from public.bookings where id = (select id from bea)), 'Neighbor discount (10%)', 'and says why');
select is((select total_cents from public.bookings where id = (select id from bea)), 4500, 'total after the discount');
select is((select deposit_due_cents from public.bookings where id = (select id from bea)), 900, 'the deposit shrinks by the same 10%');
select is((select assigned_member_id from public.bookings where id = (select id from bea)),
          (select assigned_member_id from public.bookings where id = (select id from ann)),
          'the crew member already in the area gets the job');

create temp table cal as select pg_temp.book('50000000-0000-0000-0000-000000000001', pg_temp.at(3, '10:00'), 'cal@example.com', 30.2702, -97.7431) as id;
select is((select discount_cents from public.bookings where id = (select id from cal)), 0, 'no discount on a day without work nearby');

update public.businesses set neighbor_discount_percent = 0 where id = '10000000-0000-0000-0000-000000000001';
select is(pg_temp.day_discounts(30.2702, -97.7431, 2), array[0], 'turned off, nobody is told about it');
create temp table dee as select pg_temp.book('50000000-0000-0000-0000-000000000001', pg_temp.at(2, '15:00'), 'dee@example.com', 30.2702, -97.7431) as id;
select is((select discount_cents from public.bookings where id = (select id from dee)), 0, 'and nobody gets it');
update public.businesses set neighbor_discount_percent = 10 where id = '10000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Measured quotes
-- ---------------------------------------------------------------------------

select t.expect_error($$insert into public.services (business_id, name, price_type, price_cents, duration_minutes, price_per_1000_sqft_cents)
                        values ('10000000-0000-0000-0000-000000000001', 'Odd', 'fixed', 1000, 30, 500)$$,
                      'services_area_pricing_consistent', 'a service priced by area is a "from" price');

select is((select array_agg(distinct s.slot_end - s.slot_start) from public.get_available_slots(
              'green-acres', array['50000000-0000-0000-0000-000000000002']::uuid[], ((now() at time zone 'America/Chicago')::date + 5), 1,
              null, null, 12345) s),
          array[interval '50 minutes'], 'slots are as long as the measured job (12,345 sq ft × 4 min, rounded up to 5)');
select is((select array_agg(distinct s.slot_end - s.slot_start) from public.get_available_slots(
              'green-acres', array['50000000-0000-0000-0000-000000000002']::uuid[], ((now() at time zone 'America/Chicago')::date + 5), 1) s),
          array[interval '30 minutes'], 'and the service''s own length without a measurement');

create temp table measured as select pg_temp.book('50000000-0000-0000-0000-000000000002', pg_temp.at(5, '09:00'), 'eve@example.com', 30.4, -97.9,
    '{"area_sqft": 12345, "polygons": [[[30.4, -97.9], [30.4001, -97.9], [30.4001, -97.9001]]]}') as id;
select is((select unit_price_cents from public.booking_items where booking_id = (select id from measured)), 9876, 'priced from the area');
select is((select duration_minutes from public.booking_items where booking_id = (select id from measured)), 50, 'and timed from it');
select is((select scheduled_end - scheduled_start from public.bookings where id = (select id from measured)), interval '50 minutes', 'the booking is that long');
select is((select deposit_due_cents from public.bookings where id = (select id from measured)), 2469, 'a percent deposit follows the real price');
select is((select measured_area_sqft from public.bookings where id = (select id from measured)), 12345, 'the area is kept');
select is((select jsonb_array_length(measurement) from public.bookings where id = (select id from measured)), 1, 'with the outline');

create temp table unmeasured as select pg_temp.book('50000000-0000-0000-0000-000000000002', pg_temp.at(5, '11:00'), 'fay@example.com', 30.4, -97.9) as id;
select is((select unit_price_cents from public.booking_items where booking_id = (select id from unmeasured)), 4000, 'unmeasured, it books at the minimum');
select is((select measured_area_sqft from public.bookings where id = (select id from unmeasured)), null, 'with no area');

create temp table typed as select pg_temp.book('50000000-0000-0000-0000-000000000002', pg_temp.at(5, '13:00'), 'gus@example.com', 30.4, -97.9,
    '{"area_sqft": 2000}') as id;
select is((select unit_price_cents from public.booking_items where booking_id = (select id from typed)), 4000, 'a small typed area still pays the minimum');
select is((select measurement from public.bookings where id = (select id from typed)), null, 'a typed area has no outline');

select t.expect_error($$select pg_temp.book('50000000-0000-0000-0000-000000000002', pg_temp.at(6, '09:00'), 'h@example.com', 30.4, -97.9, '{"area_sqft": 50}')$$,
                      'invalid_measurement', 'areas under 100 sq ft are refused');
select t.expect_error($$select pg_temp.book('50000000-0000-0000-0000-000000000002', pg_temp.at(6, '09:00'), 'h@example.com', 30.4, -97.9, '{"area_sqft": "big"}')$$,
                      'invalid_measurement', 'so is an area that isn''t a number');
select t.expect_error($$select pg_temp.book('50000000-0000-0000-0000-000000000002', pg_temp.at(6, '09:00'), 'h@example.com', 30.4, -97.9, '{"area_sqft": 500, "polygons": "x"}')$$,
                      'invalid_measurement', 'and an outline that isn''t a list of shapes');

create temp table mow_measured as select pg_temp.book('50000000-0000-0000-0000-000000000001', pg_temp.at(6, '09:00'), 'ivy@example.com', 30.4, -97.9,
    '{"area_sqft": 9000}') as id;
select is((select measured_area_sqft from public.bookings where id = (select id from mow_measured)), null, 'a measurement is dropped when nothing is priced by area');
select is((select unit_price_cents from public.booking_items where booking_id = (select id from mow_measured)), 5000, 'and the fixed price stands');

-- ---------------------------------------------------------------------------
-- Job reports
-- ---------------------------------------------------------------------------

update public.bookings set status = 'in_progress' where id = (select id from ann);
update public.bookings set status = 'completed' where id = (select id from ann);
select is((select count(*)::int from public.notifications where booking_id = (select id from ann) and template = 'booking.job_report'), 1,
          'finishing a job queues the job report email');
select ok((select scheduled_for > now() + interval '15 minutes' from public.notifications where booking_id = (select id from ann) and template = 'booking.job_report'),
          'a little later, so after photos make it in');

-- Tips: paid, they add to the total and the paid amount alike.
select is((select balance_due_cents from public.bookings where id = (select id from ann)), 5000, 'balance before the tip');
insert into public.payments (id, business_id, booking_id, customer_id, kind, status, amount_cents, stripe_account_id, stripe_payment_intent_id)
select '70000000-0000-0000-0000-000000000001', business_id, id, customer_id, 'tip', 'succeeded', 800, 'acct_green', 'pi_tip_1'
from public.bookings where id = (select id from ann);
select is((select tip_cents from public.bookings where id = (select id from ann)), 800, 'a paid tip is the booking''s tip');
select is((select total_cents from public.bookings where id = (select id from ann)), 5800, 'it adds to the total');
select is((select balance_due_cents from public.bookings where id = (select id from ann)), 5000, 'and never shows up as money owed');
insert into public.refunds (business_id, payment_id, amount_cents, status)
values ('10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 300, 'succeeded');
select is((select tip_cents from public.bookings where id = (select id from ann)), 500, 'a refunded tip comes off');
select is((select balance_due_cents from public.bookings where id = (select id from ann)), 5000, 'still nothing owed');

-- The crew's note.
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a2');
select public.save_job_report_note((select id from ann), '  Bagged the clippings.  ');
reset role;
select is((select report_note from public.bookings where id = (select id from ann)), 'Bagged the clippings.', 'crew can write the note to the customer');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a3');
select t.expect_error(format('select public.save_job_report_note(%L, %L)', (select id from ann), 'Hi'), 'booking_not_found', 'another business can''t');
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select t.expect_error(format('select public.save_job_report_note(%L, %L)', (select id from ann), repeat('x', 1001)), 'note_too_long', 'notes are kept short');
select t.expect_error(format('update public.bookings set tip_cents = 1 where id = %L', (select id from ann)), '42501', 'nobody types in a tip');

-- Before and after photos: crew tag their own.
select t.as_user('00000000-0000-0000-0000-0000000000a2');
insert into public.booking_attachments (business_id, booking_id, storage_path, phase, uploaded_by)
values ('10000000-0000-0000-0000-000000000001', (select id from ann), '10000000-0000-0000-0000-000000000001/' || (select id from ann) || '/a.webp', 'before',
        '00000000-0000-0000-0000-0000000000a2');
update public.booking_attachments set phase = 'after' where storage_path like '%/a.webp';
reset role;
select is((select phase from public.booking_attachments where storage_path like '%/a.webp'), 'after', 'crew can retag their own photo');
select t.expect_error($$insert into public.booking_attachments (business_id, booking_id, storage_path, phase)
                        select business_id, id, business_id || '/' || id || '/b.webp', 'during' from public.bookings limit 1$$,
                      'booking_attachments_phase_check', 'a photo is before or after');

select * from finish();
rollback;
