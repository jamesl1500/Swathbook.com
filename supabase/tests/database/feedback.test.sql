-- Product feedback (20261119000400_feedback.sql).
begin;
\set QUIET 1
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir _helpers.psql

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000000f1', 'owner@example.com', now(), '{}'),
    ('00000000-0000-0000-0000-0000000000f2', 'customer@example.com', now(), '{}'),
    ('00000000-0000-0000-0000-0000000000f3', 'rival@example.com', now(), '{}');
insert into public.businesses (id, owner_id, name, slug, trade, timezone)
values
    ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'Green Acres', 'green-acres-fb', 'lawn-care', 'America/Chicago'),
    ('10000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f3', 'Rival Lawns', 'rival-lawns-fb', 'lawn-care', 'America/Chicago');

-- Visitors can't send any.
set local role anon;
select t.expect_error($$ select public.submit_feedback('web', 'idea', 'Let me book twice') $$, '42501', 'visitors can''t send feedback');
reset role;

-- An owner sends an idea from the dashboard, for their business.
set local role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000f1', 'owner@example.com');
create temp table sent as
select public.submit_feedback('web', 'idea', '  Please add recurring jobs  ', 5, '/dashboard/schedule', null, 'Chrome on macOS',
                              '10000000-0000-0000-0000-0000000000f1') as row;
reset role;
select is((select row ->> 'message' from sent), 'Please add recurring jobs', 'the message is trimmed and sent back');
select is((select row ->> 'status' from sent), 'new', 'new notes start as new');
select is((select business_id from public.feedback where id = (select (row ->> 'id')::uuid from sent)),
          '10000000-0000-0000-0000-0000000000f1'::uuid, 'it records the owner''s business');
select is((select email from public.feedback where id = (select (row ->> 'id')::uuid from sent)), 'owner@example.com', 'and their email for a reply');
select is((select team_notified_at from public.feedback where id = (select (row ->> 'id')::uuid from sent)), null, 'the team hasn''t been told yet');

-- Someone else's business is dropped, not trusted.
set local role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000f1', 'owner@example.com');
select public.submit_feedback('owner_app', 'problem', 'The map froze', null, 'job/123', '1.2.0', 'ios 18.1', '10000000-0000-0000-0000-0000000000f3');
reset role;
select is((select business_id from public.feedback where message = 'The map froze'), null, 'a business the sender isn''t on is dropped');

-- Bad input.
set local role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000f2', 'customer@example.com');
select t.expect_error($$ select public.submit_feedback('client_app', 'praise', 'ok') $$, 'invalid_message', 'a message needs a few characters');
select t.expect_error($$ select public.submit_feedback('client_app', 'praise', 'Love it', 6) $$, 'invalid_rating', 'ratings are 1 to 5');

-- The customer sees only their own, and only the reader-facing columns.
select public.submit_feedback('client_app', 'praise', 'Booking took a minute. Love it.', 5);
select is((select count(*)::integer from public.feedback), 1, 'people see only their own feedback');
select t.expect_error($$ select email from public.feedback $$, '42501', 'not the stored email or platform');
select t.expect_error($$ update public.feedback set status = 'done' $$, '42501', 'and they can''t change a note''s status');
select t.expect_error($$ insert into public.feedback (source, kind, message) values ('web', 'idea', 'sneaky') $$, '42501', 'or write around the function');
reset role;

-- A stuck button can't flood the inbox: 10 an hour per person.
set local role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000f3', 'rival@example.com');
select public.submit_feedback('web', 'other', 'Note number ' || n) from generate_series(1, 10) n;
select t.expect_error($$ select public.submit_feedback('web', 'other', 'One too many') $$, 'feedback_rate_limited', 'the eleventh in an hour is refused');
reset role;

select * from finish();
rollback;
