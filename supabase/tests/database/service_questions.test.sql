-- Service questions and booking answers (20261114000200_service_questions.sql).
begin;
\set QUIET 1
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir _helpers.psql

-- An owner, their crew member, another business's owner, and a customer.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com', now(), '{}'),
    ('00000000-0000-0000-0000-0000000000a2', 'crew@example.com', now(), '{}'),
    ('00000000-0000-0000-0000-0000000000a3', 'rival@example.com', now(), '{}'),
    ('00000000-0000-0000-0000-0000000000c1', 'cara@example.com', now(), '{}');

insert into public.businesses (id, owner_id, name, slug, trade, timezone, is_published, booking_lead_time_minutes, buffer_minutes, onboarding_completed_at)
values
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Shine On Detail', 'shine-on', 'mobile-detailing',
     'America/Chicago', true, 0, 0, now()),
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a3', 'Rival Wash', 'rival-wash', 'mobile-detailing',
     'America/Chicago', true, 0, 0, now());
insert into public.business_members (business_id, user_id, role, display_name)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'crew', 'Carl Crew');

insert into public.business_hours (business_id, weekday, opens_at, closes_at)
select '10000000-0000-0000-0000-000000000001', d, '00:00', '23:59' from generate_series(0, 6) d;
insert into public.services (id, business_id, name, price_type, price_cents, duration_minutes) values
    ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Full detail', 'fixed', 18000, 60),
    ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Pet hair removal', 'fixed', 4000, 30),
    ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Rival wash', 'fixed', 5000, 30);

-- ---------------------------------------------------------------------------
-- The owner writes questions
-- ---------------------------------------------------------------------------
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a1');

select public.save_service_questions('50000000-0000-0000-0000-000000000001', $$[
    {"prompt": "  Make and model?  ", "kind": "text"},
    {"prompt": "What kind of car?", "kind": "choice", "options": ["Sedan", " SUV ", "Truck", "SUV", ""]},
    {"prompt": "Anything we should avoid?", "kind": "text", "required": false}
]$$);

select is((select array_agg(prompt order by sort_order) from public.service_questions where service_id = '50000000-0000-0000-0000-000000000001'),
          array['Make and model?', 'What kind of car?', 'Anything we should avoid?'], 'questions saved in order, trimmed');
select is((select options from public.service_questions where prompt = 'What kind of car?' and service_id = '50000000-0000-0000-0000-000000000001'), array['Sedan', 'SUV', 'Truck'],
          'choices trimmed, without blanks or repeats');
select is((select array_agg(is_required order by sort_order) from public.service_questions where service_id = '50000000-0000-0000-0000-000000000001'),
          array[true, true, false], 'required unless marked optional');

-- Re-saving keeps ids for questions passed back, and drops the rest.
create temp table kept as select id from public.service_questions where prompt = 'What kind of car?' and service_id = '50000000-0000-0000-0000-000000000001';
grant select on kept to authenticated;
select public.save_service_questions('50000000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('id', (select id from kept), 'prompt', 'Vehicle type?', 'kind', 'choice', 'options', jsonb_build_array('Sedan', 'SUV', 'Truck')),
    jsonb_build_object('prompt', 'Make and model?', 'kind', 'text')
));
select is((select prompt from public.service_questions where id = (select id from kept)), 'Vehicle type?', 'an edited question keeps its id');
select is((select count(*)::int from public.service_questions where service_id = '50000000-0000-0000-0000-000000000001'), 2,
          'questions left out are removed');

select t.expect_error($$select public.save_service_questions('50000000-0000-0000-0000-000000000001', '[{"prompt": "?", "kind": "text"}]')$$,
                      'invalid_question_prompt', 'a prompt needs a couple of characters');
select t.expect_error($$select public.save_service_questions('50000000-0000-0000-0000-000000000001', '[{"prompt": "Color?", "kind": "choice", "options": ["Red", "red ", "Red"]}]')$$,
                      'invalid_question_options', 'a choice needs at least two different options');
select t.expect_error($$select public.save_service_questions('50000000-0000-0000-0000-000000000001', '[{"prompt": "Color?", "kind": "scale"}]')$$,
                      'invalid_questions', 'only text and choice questions');
select t.expect_error(format('select public.save_service_questions(%L, %L)', '50000000-0000-0000-0000-000000000001',
                             (select jsonb_agg(jsonb_build_object('prompt', 'Question ' || n, 'kind', 'text')) from generate_series(1, 11) n)),
                      'too_many_questions', 'at most ten questions per service');
select t.expect_error($$select public.save_service_questions('50000000-0000-0000-0000-000000000003', '[]')$$,
                      'service_not_found', 'not another business''s service');

-- Crew read questions but can't change them.
select t.as_user('00000000-0000-0000-0000-0000000000a2');
select t.ok((select count(*) = 2 from public.service_questions), 'crew read their business''s questions');
select t.expect_error($$select public.save_service_questions('50000000-0000-0000-0000-000000000001', '[]')$$,
                      'service_not_found', 'crew can''t change questions');
select t.expect_error($$insert into public.service_questions (business_id, service_id, prompt) values
                        ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Sneaky?')$$,
                      'row-level security', 'or write them directly');

select t.as_user('00000000-0000-0000-0000-0000000000a3');
select t.ok((select count(*) = 0 from public.service_questions), 'other businesses can''t see them');
reset role;

set role anon;
select t.expect_error($$select public.save_service_questions('50000000-0000-0000-0000-000000000001', '[]')$$,
                      'permission denied', 'visitors can''t call save_service_questions');
select t.expect_error($$select * from public.service_questions$$, 'permission denied', 'visitors can''t read the table');

-- ...but they see the questions on the booking page.
select is((select jsonb_array_length(public.get_booking_page('shine-on') -> 'services' -> 0 -> 'questions')), 2, 'the booking page lists the questions');
select is((select public.get_booking_page('shine-on') -> 'services' -> 0 -> 'questions' -> 0 ->> 'prompt'), 'Vehicle type?', 'in order');
select is((select public.get_booking_page('shine-on') -> 'services' -> 0 -> 'questions' -> 0 -> 'options'), '["Sedan", "SUV", "Truck"]'::jsonb,
          'with their options');
select is((select public.get_booking_page('shine-on') -> 'services' -> 1 -> 'questions'), '[]'::jsonb, 'services without questions list none');
reset role;

-- ---------------------------------------------------------------------------
-- Customers answer them when booking
-- ---------------------------------------------------------------------------
create temp table q as
select (select id from public.service_questions where prompt = 'Vehicle type?' and service_id = '50000000-0000-0000-0000-000000000001') as kind_q,
       (select id from public.service_questions where prompt = 'Make and model?' and service_id = '50000000-0000-0000-0000-000000000001') as model_q;
-- A required question on another service, which this booking doesn't include.
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select public.save_service_questions('50000000-0000-0000-0000-000000000002', '[{"prompt": "How many pets?", "kind": "text"}]');
reset role;
alter table q add column pets_q uuid;
update q set pets_q = (select id from public.service_questions where prompt = 'How many pets?' and service_id = '50000000-0000-0000-0000-000000000002');

create function pg_temp.book(p_answers jsonb, p_slot interval default interval '2 days 3 hours')
returns uuid language sql as $$
    select booking_id from public.create_booking('10000000-0000-0000-0000-000000000001', array['50000000-0000-0000-0000-000000000001']::uuid[],
        date_trunc('hour', now()) + p_slot, '{"full_name": "Cara Customer", "email": "cara@example.com"}', '{"line1": "1 Elm St"}',
        null, 'booking_page', p_answers);
$$;

select t.expect_error($$select pg_temp.book(null)$$, 'answers_required', 'required questions must be answered');
select t.expect_error(format('select pg_temp.book(%L)', jsonb_build_array(jsonb_build_object('question_id', (select kind_q from q), 'answer', 'SUV')))::text,
                      'answers_required', 'every one of them');
select t.expect_error(format('select pg_temp.book(%L)', jsonb_build_array(
                          jsonb_build_object('question_id', (select kind_q from q), 'answer', 'Spaceship'),
                          jsonb_build_object('question_id', (select model_q from q), 'answer', 'Honda Civic'))),
                      'invalid_answers', 'a choice must be one of the options');
select t.expect_error(format('select pg_temp.book(%L)', jsonb_build_array(
                          jsonb_build_object('question_id', (select kind_q from q), 'answer', 'SUV'),
                          jsonb_build_object('question_id', (select model_q from q), 'answer', 'Honda Civic'),
                          jsonb_build_object('question_id', (select pets_q from q), 'answer', '2'))),
                      'invalid_answers', 'no answers to questions on services not being booked');
select t.expect_error(format('select pg_temp.book(%L)', jsonb_build_array(
                          jsonb_build_object('question_id', (select kind_q from q), 'answer', 'SUV'),
                          jsonb_build_object('question_id', (select kind_q from q), 'answer', 'Sedan'),
                          jsonb_build_object('question_id', (select model_q from q), 'answer', 'Honda Civic'))),
                      'invalid_answers', 'one answer per question');
select t.expect_error(format('select pg_temp.book(%L)', jsonb_build_array(
                          jsonb_build_object('question_id', (select kind_q from q), 'answer', 'SUV'),
                          jsonb_build_object('question_id', (select model_q from q), 'answer', repeat('x', 1001)))),
                      'invalid_answers', 'answers stay under 1,000 characters');
select t.ok((select count(*) = 0 from public.bookings where business_id = '10000000-0000-0000-0000-000000000001'), 'a refused booking leaves nothing behind');

create temp table booked as
select pg_temp.book(jsonb_build_array(
    jsonb_build_object('question_id', upper((select model_q from q)::text), 'answer', '  Honda Civic '),
    jsonb_build_object('question_id', (select kind_q from q), 'answer', 'SUV')
)) as id;
select is((select array_agg(prompt || ': ' || answer order by sort_order) from public.booking_answers where booking_id = (select id from booked)),
          array['Vehicle type?: SUV', 'Make and model?: Honda Civic'], 'answers saved in question order, trimmed');
select is((select service_name from public.booking_answers where booking_id = (select id from booked) limit 1), 'Full detail',
          'with the service name copied in');

-- ---------------------------------------------------------------------------
-- Who sees the answers
-- ---------------------------------------------------------------------------
grant select on booked to authenticated;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a2');
select t.ok((select count(*) = 2 from public.booking_answers), 'crew see the answers for their business''s jobs');
select t.expect_error($$insert into public.booking_answers (business_id, booking_id, service_name, prompt, answer)
                        select business_id, id, 'x', 'x', 'x' from public.bookings limit 1$$,
                      'permission denied', 'nobody writes answers directly');
select t.as_user('00000000-0000-0000-0000-0000000000a3');
select t.ok((select count(*) = 0 from public.booking_answers), 'other businesses can''t');
select t.as_user('00000000-0000-0000-0000-0000000000c1', 'cara@example.com');
select is((select public.my_booking((select id from booked)) -> 'answers' -> 0 ->> 'answer'), 'SUV', 'the customer sees their own answers');
reset role;

-- Editing questions later never rewrites a past job.
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select public.save_service_questions('50000000-0000-0000-0000-000000000001', '[]');
reset role;
select is((select count(*)::int from public.booking_answers where booking_id = (select id from booked)), 2, 'answers outlive their questions');
select t.ok((select bool_and(question_id is null) from public.booking_answers where booking_id = (select id from booked)),
            'and just lose the link');

select * from finish();
rollback;
