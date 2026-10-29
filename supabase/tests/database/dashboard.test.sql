-- Dashboard read functions and grants added in 20261024000100_dashboard.sql.
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

insert into public.businesses (id, owner_id, name, slug, trade, timezone, is_published, booking_lead_time_minutes, onboarding_completed_at)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Dash Lawn', 'dash-lawn', 'lawn-care', 'America/Chicago', true, 0, now());
insert into public.businesses (owner_id, name, slug, trade) values ('00000000-0000-0000-0000-0000000000b1', 'Other Co', 'other-co', 'x');

insert into public.customers (id, business_id, full_name, email, phone) values
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Ada Lovelace', 'ada@example.com', '512-555-0101'),
    ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Grace Hopper', 'grace@example.com', '512-555-0102');
insert into public.customer_addresses (id, business_id, customer_id, line1, is_primary)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '1 Loop St', true);

-- A past completed job and an upcoming one for Ada, plus a payment.
insert into public.bookings (id, business_id, customer_id, status, scheduled_start, scheduled_end)
values
    ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'confirmed', now() - interval '3 days', now() - interval '3 days' + interval '1 hour'),
    ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'confirmed', now() + interval '2 days', now() + interval '2 days' + interval '1 hour');
insert into public.booking_items (business_id, booking_id, name, unit_price_cents)
values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Mow', 5000);
insert into public.payments (business_id, booking_id, customer_id, kind, status, amount_cents, stripe_account_id, stripe_payment_intent_id)
values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'full', 'succeeded', 5000, 'acct_x', 'pi_dash');

-- --- customer_list ------------------------------------------------------------
set local role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a1');

select is((select count(*)::int from public.customer_list('10000000-0000-0000-0000-000000000001')), 2, 'lists the business''s customers');
select is(
    (select row(booking_count, lifetime_paid_cents, total_count)::text from public.customer_list('10000000-0000-0000-0000-000000000001') where full_name = 'Ada Lovelace'),
    '(2,5000,2)',
    'counts bookings, lifetime paid and the total for paging'
);
select ok((select next_booking_at > now() and last_booking_at < now() from public.customer_list('10000000-0000-0000-0000-000000000001') where full_name = 'Ada Lovelace'),
          'knows the last and next visit');
select is((select string_agg(full_name, ',') from public.customer_list('10000000-0000-0000-0000-000000000001', 'HOPPER')), 'Grace Hopper', 'search is case-insensitive on name');
select is((select string_agg(full_name, ',') from public.customer_list('10000000-0000-0000-0000-000000000001', '0101')), 'Ada Lovelace', 'search matches phone numbers');
select is((select count(*)::int from public.customer_list('10000000-0000-0000-0000-000000000001', null, 1, 1)), 1, 'pages results');

select is((public.business_overview('10000000-0000-0000-0000-000000000001') ->> 'customers')::int, 2, 'overview counts customers');
select is((public.business_overview('10000000-0000-0000-0000-000000000001') ->> 'collected_this_month_cents')::int, 5000, 'overview totals this month''s payments');

-- New address columns are writable by owners (Google place data from the app).
update public.customer_addresses set google_place_id = 'ChIJtest', formatted_address = '1 Loop St, Austin'
where id = '30000000-0000-0000-0000-000000000001';
select is((select google_place_id from public.customer_addresses where id = '30000000-0000-0000-0000-000000000001'), 'ChIJtest', 'owners can save Google place data');
update public.businesses set arrival_window_minutes = 90 where id = '10000000-0000-0000-0000-000000000001';
select is((select arrival_window_minutes from public.businesses where id = '10000000-0000-0000-0000-000000000001'), 90, 'owners can set the arrival window');

-- Owners can book a job by hand through RLS (column defaults call private generators).
insert into public.bookings (business_id, customer_id, address_id, status, source, scheduled_start, scheduled_end)
values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', null, 'confirmed', 'manual', now() + interval '5 days', now() + interval '5 days 1 hour');
select ok((select reference ~ '^[0-9A-F]{8}$' and length(public_token) = 64 from public.bookings
           where customer_id = '20000000-0000-0000-0000-000000000002'),
          'owners can create jobs, with a reference and customer token');

-- --- isolation ------------------------------------------------------------------
select t.as_user('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.customer_list('10000000-0000-0000-0000-000000000001')), 0, 'another business sees no customers (RLS applies)');
select is((public.business_overview('10000000-0000-0000-0000-000000000001') ->> 'customers'), null, 'another business gets no overview');

reset role;
set local role anon;
select throws_ok($$select * from public.customer_list('10000000-0000-0000-0000-000000000001')$$, '42501', null, 'anon cannot list customers');
select throws_ok($$select public.business_overview('10000000-0000-0000-0000-000000000001')$$, '42501', null, 'anon cannot read the overview');

reset role;
select * from finish();
rollback;
