-- Customer reschedule/cancel and the owner's bookings list (20261027000100_bookings_self_service.sql).
begin;
\set QUIET 1
create extension if not exists pgtap with schema extensions;
select no_plan();

create schema t;
create function t.as_user(p_id uuid) returns void language sql as $$
    select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
grant usage on schema t to public;
grant execute on all functions in schema t to public;

insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
    ('00000000-0000-0000-0000-0000000000b1', 'other@example.com');
insert into public.businesses (id, owner_id, name, slug, trade, timezone, is_published, booking_lead_time_minutes, buffer_minutes,
                               cancellation_window_hours, onboarding_completed_at)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Self Serve', 'self-serve', 'house-cleaning',
        'America/Chicago', true, 0, 0, 24, now());
insert into public.business_hours (business_id, weekday, opens_at, closes_at)
select '10000000-0000-0000-0000-000000000001', d, '00:00', '23:59' from generate_series(0, 6) d;
insert into public.services (id, business_id, name, price_cents, duration_minutes)
values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Deep clean', 26000, 60);

-- Only the owner works (one seat), so overlapping times are truly taken.
create temp table first as
select * from public.create_booking('10000000-0000-0000-0000-000000000001', array['50000000-0000-0000-0000-000000000001']::uuid[],
    date_trunc('hour', now()) + interval '3 days', '{"full_name":"Cara Customer","email":"cara@example.com","phone":"512-555-0101"}', '{"line1":"1 Elm"}');
create temp table second as
select * from public.create_booking('10000000-0000-0000-0000-000000000001', array['50000000-0000-0000-0000-000000000001']::uuid[],
    date_trunc('hour', now()) + interval '3 days 2 hours', '{"full_name":"Dan Driveway","email":"dan@example.com"}', '{"line1":"2 Elm"}');

select is((select status::text from first), 'confirmed', 'auto-confirmed booking to work with');
select is((public.customer_booking_options((select public_token from first)) ->> 'can_reschedule')::boolean, true, 'far enough out to reschedule');

-- Reschedule ignores its own slot, but not other people's.
select ok(exists (select 1 from public.get_reschedule_slots((select public_token from first), (now() + interval '3 days')::date, 2)
                  where slot_start = (select scheduled_start from public.bookings where id = (select booking_id from first)) + interval '30 minutes'),
          'a slot overlapping only its own current time is offered');
select ok(not exists (select 1 from public.get_reschedule_slots((select public_token from first), (now() + interval '3 days')::date, 2)
                      where slot_start = (select scheduled_start from public.bookings where id = (select booking_id from second))),
          'another customer''s time is not offered');
select throws_ok(format('select public.customer_reschedule_booking(%L, %L)', (select public_token from first),
                        (select scheduled_start from public.bookings where id = (select booking_id from second))),
                 'P0001', 'slot_unavailable', 'and cannot be taken');

select lives_ok(format('select public.customer_reschedule_booking(%L, %L)', (select public_token from first),
                       (select scheduled_start + interval '1 day' from public.bookings where id = (select booking_id from first))),
                'the customer moves to an open time');
select is((select customer_reschedule_count from public.bookings where id = (select booking_id from first)), 1, 'the move is counted');
select is((select count(*)::int from public.notifications where booking_id = (select booking_id from first) and template = 'owner.customer_rescheduled'), 1,
          'the owner is told');
select is((select count(*)::int from public.notifications where booking_id = (select booking_id from first) and template = 'booking.rescheduled'), 1,
          'the customer gets the new time');

-- Limits and the cancellation window.
update public.bookings set customer_reschedule_count = 3 where id = (select booking_id from first);
select is(public.customer_booking_options((select public_token from first)) ->> 'reschedule_blocked_reason', 'limit', 'three moves at most');
update public.bookings set customer_reschedule_count = 0 where id = (select booking_id from first);
update public.businesses set cancellation_window_hours = 168 where id = '10000000-0000-0000-0000-000000000001';
select is(public.customer_booking_options((select public_token from first)) ->> 'reschedule_blocked_reason', 'too_late', 'not inside the cancellation window');
select throws_ok(format('select public.customer_reschedule_booking(%L, now() + interval ''5 days'')', (select public_token from first)),
                 'P0001', 'reschedule_not_allowed', 'and refused if tried');
update public.businesses set cancellation_window_hours = 24, allow_customer_reschedule = false where id = '10000000-0000-0000-0000-000000000001';
select is(public.customer_booking_options((select public_token from first)) ->> 'reschedule_blocked_reason', 'not_offered', 'the business can turn it off');
update public.businesses set allow_customer_reschedule = true where id = '10000000-0000-0000-0000-000000000001';

-- Cancelling: a confirmed booking becomes a request the owner answers.
select is(public.customer_cancel_booking((select public_token from first), 'Moving away'), 'requested', 'confirmed bookings ask first');
select is((select status::text || '|' || cancel_request_reason from public.bookings where id = (select booking_id from first)),
          'confirmed|Moving away', 'the booking stays on with the reason saved');
select is((select array_agg(template order by template) from public.notifications
           where booking_id = (select booking_id from first) and template in ('owner.cancel_request', 'booking.cancel_requested')),
          array['booking.cancel_requested', 'owner.cancel_request'], 'both sides are emailed');
select is((public.customer_booking_options((select public_token from first)) ->> 'can_reschedule')::boolean, false, 'no rescheduling while a request is open');
select throws_ok(format('select public.customer_cancel_booking(%L)', (select public_token from first)), 'P0001', 'cancel_not_allowed', 'one request at a time');

create temp table ids as select (select booking_id from first) as first_id;
grant select on ids to authenticated;

set local role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000b1');
select throws_ok('select public.resolve_cancel_request((select first_id from ids), true)', '42501', null, 'strangers cannot answer');
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select is((select (public.booking_counts('10000000-0000-0000-0000-000000000001') ->> 'cancel_requests')::int), 1, 'the owner sees one cancel request');
select is((select customer_name from public.booking_list('10000000-0000-0000-0000-000000000001', p_cancel_requests => true)), 'Cara Customer',
          'and can filter to it');
select lives_ok('select public.resolve_cancel_request((select first_id from ids), false, ''We can do a later time instead'')', 'the owner declines');
select is((select cancel_requested_at::text from public.bookings where id = (select first_id from ids)), null, 'the request is cleared');
reset role;
select is((select payload ->> 'note' from public.notifications where booking_id = (select booking_id from first) and template = 'booking.cancel_declined'),
          'We can do a later time instead', 'the customer hears why');

select public.customer_cancel_booking((select public_token from first));
set local role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select lives_ok('select public.resolve_cancel_request((select first_id from ids), true)', 'the owner approves a second request');
select is((select status::text from public.bookings where id = (select first_id from ids)), 'cancelled', 'and the booking is cancelled');

-- The list: search, filters, ordering and paging.
select is((select count(*)::int from public.booking_list('10000000-0000-0000-0000-000000000001', p_search => 'dan')), 1, 'search by customer name');
select is((select count(*)::int from public.booking_list('10000000-0000-0000-0000-000000000001', p_search => '512-555-0101')), 1, 'or phone');
select is((select count(*)::int from public.booking_list('10000000-0000-0000-0000-000000000001', p_statuses => array['cancelled']::public.booking_status[])), 1, 'by status');
select is((select total_count::int from public.booking_list('10000000-0000-0000-0000-000000000001', p_limit => 1) limit 1), 2, 'with a total for paging');
select is((select services from public.booking_list('10000000-0000-0000-0000-000000000001') limit 1), 'Deep clean', 'services are listed');
select t.as_user('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.booking_list('10000000-0000-0000-0000-000000000001')), 0, 'other businesses see nothing (RLS)');
reset role;
select is((select count(*)::int from public.booking_list('10000000-0000-0000-0000-000000000001', p_search => left((select reference from second), 5))), 1,
          'search by reference');

-- A not-yet-accepted request is cancelled straight away.
update public.businesses set auto_confirm = false where id = '10000000-0000-0000-0000-000000000001';
create temp table third as
select * from public.create_booking('10000000-0000-0000-0000-000000000001', array['50000000-0000-0000-0000-000000000001']::uuid[],
    date_trunc('hour', now()) + interval '6 days', '{"full_name":"Eve Early","email":"eve@example.com"}', '{"line1":"3 Elm"}');
select is(public.customer_cancel_booking((select public_token from third), 'Changed my mind'), 'cancelled', 'unaccepted requests cancel immediately');
select is((select count(*)::int from public.notifications where booking_id = (select booking_id from third) and template = 'owner.customer_cancelled'), 1,
          'and the owner is told');

create temp table tokens as select (select public_token from second) as token;
grant select on tokens to authenticated;
set local role authenticated;
select throws_ok('select public.customer_booking_options((select token from tokens))', '42501', null, 'token functions are server-only');
reset role;

select * from finish();
rollback;
