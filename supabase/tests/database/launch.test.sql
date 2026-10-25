-- Billing gates, deposit holds, booking email queue and team functions
-- (20261026000100_billing.sql, 20261026000200_notifications_team.sql).
begin;
\set QUIET 1
create extension if not exists pgtap with schema extensions;
select no_plan();

create schema t;
create function t.as_user(p_id uuid, p_email text default null) returns void language sql as $$
    select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'email', p_email)::text, true);
$$;
grant usage on schema t to public;
grant execute on all functions in schema t to public;

insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
    ('00000000-0000-0000-0000-0000000000c1', 'crew1@example.com'),
    ('00000000-0000-0000-0000-0000000000c2', 'crew2@example.com'),
    ('00000000-0000-0000-0000-0000000000f1', 'stranger@example.com');

insert into public.businesses (id, owner_id, name, slug, trade, timezone, is_published, booking_lead_time_minutes, onboarding_completed_at)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Launch Detail', 'launch-detail', 'mobile-detailing', 'America/Chicago', true, 0, now());
insert into public.business_hours (business_id, weekday, opens_at, closes_at)
select '10000000-0000-0000-0000-000000000001', d, '00:00', '23:59' from generate_series(0, 6) d;
insert into public.services (id, business_id, name, price_cents, duration_minutes, deposit_type, deposit_percent)
values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Full detail', 18000, 60, 'percent', 25);
insert into public.stripe_connect_accounts (business_id, stripe_account_id, charges_enabled)
values ('10000000-0000-0000-0000-000000000001', 'acct_launch', true);

-- --- Trial and access ------------------------------------------------------------
select ok((select trial_ends_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour'
           from public.businesses where id = '10000000-0000-0000-0000-000000000001'),
          'finishing onboarding starts a 14-day trial');
select isnt(public.get_booking_page('launch-detail'), null, 'the page is open during the trial');

update public.businesses set trial_ends_at = now() - interval '1 minute' where id = '10000000-0000-0000-0000-000000000001';
select is(public.get_booking_page('launch-detail'), null, 'a lapsed trial pauses the page');
select is((select count(*)::int from public.get_available_slots('launch-detail', array['50000000-0000-0000-0000-000000000001']::uuid[])), 0, 'and offers no times');
select throws_ok($$
    select * from public.create_booking('10000000-0000-0000-0000-000000000001', array['50000000-0000-0000-0000-000000000001']::uuid[],
        date_trunc('hour', now()) + interval '2 days', '{"full_name":"Late","email":"late@example.com"}', '{"line1":"1 Main"}')
$$, 'P0002', 'business_not_found', 'and refuses new bookings');

insert into public.subscriptions (business_id, stripe_subscription_id, stripe_customer_id, plan, status)
values ('10000000-0000-0000-0000-000000000001', 'sub_launch', 'cus_launch', 'crew', 'past_due');
select isnt(public.get_booking_page('launch-detail'), null, 'past_due keeps the page open while Stripe retries');
update public.subscriptions set status = 'canceled' where stripe_subscription_id = 'sub_launch';
select is(public.get_booking_page('launch-detail'), null, 'a canceled plan pauses it');
update public.subscriptions set status = 'active' where stripe_subscription_id = 'sub_launch';
select isnt(public.get_booking_page('launch-detail'), null, 'an active plan reopens it');

select throws_ok($$update public.businesses set trial_ends_at = now() + interval '1 year'$$, '42501', null, 'owners cannot extend their own trial')
from (select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true), set_config('role', 'authenticated', true)) s;
reset role;

-- --- Deposit hold and its emails --------------------------------------------------
create temp table booked as
select * from public.create_booking(
    '10000000-0000-0000-0000-000000000001', array['50000000-0000-0000-0000-000000000001']::uuid[],
    date_trunc('hour', now()) + interval '3 days', '{"full_name":"Pat Payer","email":"pat@example.com"}', '{"line1":"9 Oak"}');

select is((select status::text from booked), 'pending_payment', 'a deposit booking waits for payment');
select ok((select hold_expires_at between now() + interval '29 minutes' and now() + interval '31 minutes' from booked), 'the slot is held for 30 minutes');
select ok(
    (select scheduled_for between now() + interval '9 minutes' and now() + interval '11 minutes'
     from public.notifications where booking_id = (select booking_id from booked) and template = 'booking.deposit_reminder' and to_address = 'pat@example.com'),
    'a finish-paying reminder is queued for 10 minutes later');

-- Paid: reminder canceled, confirmations queued.
update public.bookings set status = 'confirmed' where id = (select booking_id from booked);
select is((select status::text from public.notifications where booking_id = (select booking_id from booked) and template = 'booking.deposit_reminder'),
          'canceled', 'paying cancels the reminder');
select is((select count(*)::int from public.notifications where booking_id = (select booking_id from booked) and template = 'booking.confirmed' and status = 'queued'),
          1, 'the customer gets a confirmation');
select is((select to_address from public.notifications where booking_id = (select booking_id from booked) and template = 'owner.new_booking'),
          'owner@example.com', 'the owner hears about the new booking');
select is((select count(*)::int from public.notifications where booking_id = (select booking_id from booked) and template = 'booking.reminder' and status = 'queued'),
          1, 'a day-before reminder is scheduled');

-- Rescheduling replaces the reminder and tells the customer.
update public.bookings set scheduled_start = scheduled_start + interval '1 day', scheduled_end = scheduled_end + interval '1 day'
where id = (select booking_id from booked);
select is((select count(*)::int from public.notifications where booking_id = (select booking_id from booked) and template = 'booking.rescheduled'), 1, 'reschedules are emailed');
select is((select count(*)::int from public.notifications where booking_id = (select booking_id from booked) and template = 'booking.reminder' and status = 'queued'),
          1, 'only one live reminder after a reschedule');

-- An abandoned hold is released and the customer is told.
create temp table abandoned as
select * from public.create_booking(
    '10000000-0000-0000-0000-000000000001', array['50000000-0000-0000-0000-000000000001']::uuid[],
    date_trunc('hour', now()) + interval '7 days', '{"full_name":"Gone","email":"gone@example.com"}', '{"line1":"2 Elm"}');
update public.bookings set hold_expires_at = now() - interval '1 second' where id = (select booking_id from abandoned);
select is(public.release_expired_holds(), 1, 'expired holds are released');
select is((select status::text from public.bookings where id = (select booking_id from abandoned)), 'cancelled', 'the booking is cancelled');
select is(
    (select array_agg(template || ':' || status order by template) from public.notifications where booking_id = (select booking_id from abandoned)),
    array['booking.deposit_reminder:canceled', 'booking.hold_expired:queued'],
    'the reminder is dropped and a hold-expired note is queued');

-- Manual jobs: the customer is told, the owner (who made it) isn't.
insert into public.customers (id, business_id, full_name, email) values ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 'Walk In', 'walkin@example.com');
insert into public.bookings (id, business_id, customer_id, status, source, scheduled_start, scheduled_end)
values ('40000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000009', 'confirmed', 'manual', now() + interval '5 days', now() + interval '5 days 1 hour');
select is((select array_agg(template order by template) from public.notifications where booking_id = '40000000-0000-0000-0000-000000000009'),
          array['booking.confirmed', 'booking.reminder'], 'manual jobs email the customer only');

-- --- Worker claim ---------------------------------------------------------------
select ok((select count(*) > 0 from public.claim_notifications(100)), 'the worker claims due emails');
select is((select count(*)::int from public.claim_notifications(100)), 0, 'a claimed email is not handed out twice');
select is((select count(*)::int from public.notifications where business_id = '10000000-0000-0000-0000-000000000001'
           and template in ('booking.reminder', 'booking.deposit_reminder') and attempts > 0), 0,
          'future reminders are not claimed early');
set local role authenticated;
select throws_ok($$select * from public.claim_notifications(1)$$, '42501', null, 'clients cannot claim emails');
reset role;

-- --- Seats --------------------------------------------------------------------------
update public.subscriptions set plan = 'solo' where stripe_subscription_id = 'sub_launch';
set local role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a1', 'owner@example.com');
select throws_ok($$select public.create_business_invitation('10000000-0000-0000-0000-000000000001', 'crew1@example.com', 'crew')$$,
                 'P0001', 'seat_limit', 'Solo is one seat: the owner');
reset role;
update public.subscriptions set plan = 'crew' where stripe_subscription_id = 'sub_launch';
set local role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a1', 'owner@example.com');
select lives_ok($$select public.create_business_invitation('10000000-0000-0000-0000-000000000001', 'crew1@example.com', 'crew')$$, 'Crew allows invites');
select is((select row(used, seat_limit)::text from public.team_seats('10000000-0000-0000-0000-000000000001')), '(2,5)', 'seats count the owner and pending invites');
create temp table invite_token as select public.create_business_invitation('10000000-0000-0000-0000-000000000001', 'crew2@example.com', 'crew') as token;
select is((select business_name || '|' || email || '|' || expired from public.invitation_preview((select token from invite_token))),
          'Launch Detail|crew2@example.com|false', 'an invite link previews its business');

select t.as_user('00000000-0000-0000-0000-0000000000c2', 'crew2@example.com');
select is(public.accept_business_invitation((select token from invite_token)), '10000000-0000-0000-0000-000000000001'::uuid, 'the invitee joins');
select is((select string_agg(email || ':' || role, ',' order by email) from public.team_members('10000000-0000-0000-0000-000000000001')),
          'crew2@example.com:crew,owner@example.com:owner', 'teammates see each other with emails');

select t.as_user('00000000-0000-0000-0000-0000000000f1', 'stranger@example.com');
select is((select count(*)::int from public.team_members('10000000-0000-0000-0000-000000000001')), 0, 'outsiders see no one');
select is((select count(*)::int from public.team_seats('10000000-0000-0000-0000-000000000001')), 0, 'or any seat counts');
reset role;

-- Pending invites by email, accepted from onboarding (verified email required).
set local role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a1', 'owner@example.com');
select public.create_business_invitation('10000000-0000-0000-0000-000000000001', 'stranger@example.com', 'crew');
select t.as_user('00000000-0000-0000-0000-0000000000f1', 'stranger@example.com');
select is((select business_name || ':' || role from public.my_pending_invitations()), 'Launch Detail:crew', 'the invitee sees their pending invite');
select throws_ok($$select public.accept_invitation((select invitation_id from public.my_pending_invitations()))$$, '42501', null,
                 'an unverified account cannot accept by id');
reset role;
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000f1';
set local role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000f1', 'stranger@example.com');
select is(public.accept_invitation((select invitation_id from public.my_pending_invitations())), '10000000-0000-0000-0000-000000000001'::uuid,
          'a verified invitee joins from onboarding');
select is((select count(*)::int from public.my_pending_invitations()), 0, 'and the invite is no longer pending');
select t.as_user('00000000-0000-0000-0000-0000000000c1', 'crew1@example.com');
select is((select count(*)::int from public.my_pending_invitations()), 1, 'others only see invites for their own email');
reset role;

select ok((select count(*) = 2 from cron.job where jobname in ('release-expired-holds', 'send-notifications')), 'hold release and email jobs are scheduled');

select * from finish();
rollback;
