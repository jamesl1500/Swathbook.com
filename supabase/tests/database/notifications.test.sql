-- Team notifications (20261114000300_owner_notifications.sql).
begin;
\set QUIET 1
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir _helpers.psql

-- An owner, an admin, a crew member, and another business's owner.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com', now(), '{}'),
    ('00000000-0000-0000-0000-0000000000a2', 'admin@example.com', now(), '{}'),
    ('00000000-0000-0000-0000-0000000000a3', 'crew@example.com', now(), '{}'),
    ('00000000-0000-0000-0000-0000000000a4', 'rival@example.com', now(), '{}');

insert into public.businesses (id, owner_id, name, slug, trade, timezone, onboarding_completed_at) values
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Shine On', 'shine-on', 'mobile-detailing', 'America/Chicago', now()),
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a4', 'Rival', 'rival', 'mobile-detailing', 'America/Chicago', now());
insert into public.business_members (id, business_id, user_id, role, display_name) values
    ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'admin', 'Ada Admin'),
    ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'crew', 'Carl Crew');
-- Everyone joined yesterday, so today's changes are news to them.
update public.business_members set created_at = now() - interval '1 day';

insert into public.customers (id, business_id, full_name, email) values
    ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Pat Customer', 'pat@example.com'),
    ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Hal Hold', 'hal@example.com');

-- A booking the system made (no actor), one assigned to the crew member, and an unpaid hold.
insert into public.bookings (id, business_id, customer_id, status, scheduled_start, scheduled_end, assigned_member_id, hold_expires_at) values
    ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'confirmed',
     now() + interval '2 days', now() + interval '2 days 1 hour', null, null),
    ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'confirmed',
     now() + interval '3 days', now() + interval '3 days 1 hour', '20000000-0000-0000-0000-000000000003', null),
    ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'pending_payment',
     now() + interval '4 days', now() + interval '4 days 1 hour', null, now() + interval '30 minutes');
-- The hold runs out, as holds do.
update public.bookings set status = 'cancelled' where id = '40000000-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------------
-- What each person sees
-- ---------------------------------------------------------------------------
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select is((public.my_notifications('10000000-0000-0000-0000-000000000001') ->> 'unread')::int, 2, 'the owner hears about both new bookings');
select is((select array_agg(i ->> 'customer_name' order by i ->> 'booking_id')
           from jsonb_array_elements(public.my_notifications('10000000-0000-0000-0000-000000000001') -> 'items') i),
          array['Pat Customer', 'Pat Customer'], 'and not about the unpaid hold coming and going');
select is((public.my_notifications('10000000-0000-0000-0000-000000000001') -> 'items' -> 0 ->> 'unread')::boolean, true, 'new items are marked unread');

-- The owner's own change doesn't notify them, but does notify the admin.
update public.bookings set scheduled_start = scheduled_start + interval '1 hour', scheduled_end = scheduled_end + interval '1 hour'
where id = '40000000-0000-0000-0000-000000000001';
select is((select count(*)::int from jsonb_array_elements(public.my_notifications('10000000-0000-0000-0000-000000000001') -> 'items') i
           where i ->> 'type' = 'rescheduled'), 0, 'your own changes never notify you');

select t.as_user('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from jsonb_array_elements(public.my_notifications('10000000-0000-0000-0000-000000000001') -> 'items') i
           where i ->> 'type' = 'rescheduled'), 1, 'but they notify the rest of the team');

select t.as_user('00000000-0000-0000-0000-0000000000a3');
select is((select array_agg(distinct i ->> 'booking_id') from jsonb_array_elements(public.my_notifications('10000000-0000-0000-0000-000000000001') -> 'items') i),
          array['40000000-0000-0000-0000-000000000002'], 'crew only hear about jobs they''re on');

select t.as_user('00000000-0000-0000-0000-0000000000a4');
select is(public.my_notifications('10000000-0000-0000-0000-000000000001'), '{"unread": 0, "items": []}'::jsonb, 'other businesses hear nothing');
reset role;

-- A paid deposit shows as the booking going through, not as two items.
insert into public.bookings (id, business_id, customer_id, status, scheduled_start, scheduled_end, hold_expires_at) values
    ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'pending_payment',
     now() + interval '5 days', now() + interval '5 days 1 hour', now() + interval '30 minutes');
update public.bookings set status = 'confirmed' where id = '40000000-0000-0000-0000-000000000004';
insert into public.booking_events (business_id, booking_id, event_type, data)
values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'payment', '{"kind": "deposit", "amount_cents": 4500}'),
       ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'payment', '{"kind": "balance", "amount_cents": 13500}');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select is((select array_agg(coalesce(i ->> 'to_status', i -> 'data' ->> 'kind') order by i ->> 'type')
           from jsonb_array_elements(public.my_notifications('10000000-0000-0000-0000-000000000001') -> 'items') i
           where i ->> 'booking_id' = '40000000-0000-0000-0000-000000000004'),
          array['balance', 'confirmed'], 'a paid deposit is one "confirmed" item; balance payments still show');

-- ---------------------------------------------------------------------------
-- Catching up
-- ---------------------------------------------------------------------------
select public.mark_notifications_read('10000000-0000-0000-0000-000000000001');
select is((public.my_notifications('10000000-0000-0000-0000-000000000001') ->> 'unread')::int, 0, 'catching up clears the count');
select is((public.my_notifications('10000000-0000-0000-0000-000000000001') -> 'items' -> 0 ->> 'unread')::boolean, false, 'and marks items read');
reset role;

-- Something new happens after they caught up.
insert into public.booking_events (business_id, booking_id, event_type, data, created_at)
values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'cancel_requested', '{"reason": "Moving"}', now() + interval '1 minute');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select is((public.my_notifications('10000000-0000-0000-0000-000000000001') ->> 'unread')::int, 1, 'new changes count again');
select is((public.my_notifications('10000000-0000-0000-0000-000000000001') -> 'items' -> 0 ->> 'type'), 'cancel_requested', 'newest first');
select is((public.my_notifications('10000000-0000-0000-0000-000000000001', 1) -> 'items' ->> 0 is not null
           and jsonb_array_length(public.my_notifications('10000000-0000-0000-0000-000000000001', 1) -> 'items') = 1), true, 'the list is limited');

select t.expect_error($$insert into public.notification_reads (user_id, business_id) values
                        ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001')$$,
                      'row-level security', 'nobody records read state for someone else');
select t.as_user('00000000-0000-0000-0000-0000000000a4');
select t.expect_error($$select public.mark_notifications_read('10000000-0000-0000-0000-000000000001')$$,
                      'row-level security', 'or for a business they aren''t part of');
reset role;

set role anon;
select t.expect_error($$select public.my_notifications('10000000-0000-0000-0000-000000000001')$$, 'permission denied', 'visitors can''t read notifications');
reset role;

select t.ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'booking_events'),
            'booking changes stream to open dashboards');

select * from finish();
rollback;
