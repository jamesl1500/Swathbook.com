-- Account deletion (public.delete_account) from 20261024000100_dashboard.sql.
begin;
\set QUIET 1
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
    ('00000000-0000-0000-0000-0000000000a2', 'busy@example.com'),
    ('00000000-0000-0000-0000-0000000000c1', 'crew@example.com');

insert into public.businesses (id, owner_id, name, slug, trade) values
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Leaving Lawn', 'leaving-lawn', 'lawn-care'),
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'Leaving Two', 'leaving-two', 'lawn-care'),
    ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a2', 'Busy Lawn', 'busy-lawn', 'lawn-care');
insert into public.business_members (business_id, user_id, role)
values ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c1', 'crew');

insert into public.customers (id, business_id, full_name) values
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Past Customer'),
    ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Future Customer');
-- Past, paid work (payments restrict-reference bookings and customers).
insert into public.bookings (id, business_id, customer_id, status, scheduled_start, scheduled_end) values
    ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'completed', now() - interval '3 days', now() - interval '3 days' + interval '1 hour'),
    ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'cancelled', now() + interval '3 days', now() + interval '3 days' + interval '1 hour'),
    ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'confirmed', now() + interval '2 days', now() + interval '2 days' + interval '1 hour');
insert into public.payments (business_id, booking_id, customer_id, kind, status, amount_cents, stripe_account_id, stripe_payment_intent_id)
values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'full', 'succeeded', 5000, 'acct_x', 'pi_leaving');

-- Clients can't call it, not even for themselves.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.delete_account('00000000-0000-0000-0000-0000000000a1')$$, '42501', null, 'signed-in users cannot call delete_account directly');
reset role;
set local role anon;
select throws_ok($$select public.delete_account('00000000-0000-0000-0000-0000000000a1')$$, '42501', null, 'anon cannot call delete_account');
reset role;

set local role service_role;
select throws_ok($$select public.delete_account('00000000-0000-0000-0000-0000000000a2')$$, 'P0001', 'upcoming_jobs', 'refuses while an owned business has upcoming jobs');
select lives_ok($$select public.delete_account('00000000-0000-0000-0000-0000000000a1')$$, 'deletes an owner with past paid work and cancelled future jobs');
select lives_ok($$select public.delete_account('00000000-0000-0000-0000-0000000000c1')$$, 'deletes a crew member of someone else''s business');
reset role;

select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000000a1'), 0, 'the user is gone');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 0, 'their profile is gone');
select is((select count(*)::int from public.businesses where owner_id = '00000000-0000-0000-0000-0000000000a1'), 0, 'both of their businesses are gone');
select is((select count(*)::int from public.payments where business_id = '10000000-0000-0000-0000-000000000001'), 0, 'business data cascades away');
select is((select count(*)::int from public.businesses where id = '10000000-0000-0000-0000-000000000003'), 1, 'the crew member''s employer is untouched');
select is((select count(*)::int from public.business_members where user_id = '00000000-0000-0000-0000-0000000000c1'), 0, 'the crew membership is removed');
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000000a2'), 1, 'the refused user still exists');

select * from finish();
rollback;
