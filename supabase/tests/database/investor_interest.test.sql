-- Investor interest from /investors (20261121000200_investor_interest.sql):
-- written and read only with the service role.
begin;
\set QUIET 1
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.investor_interest (full_name, email, investor_type)
values ('Ada Park', 'ada@example.com', 'angel');
select is((select status::text || '|' || check_size::text || '|' || accredited from public.investor_interest where email = 'ada@example.com'),
          'new|not_sure|false', 'new interest starts as new, with an unknown check size');

select throws_ok($$insert into public.investor_interest (full_name, email, investor_type) values ('Bo', 'not-an-email', 'fund')$$,
                 '23514', null, 'emails are checked');

set local role anon;
select throws_ok($$select * from public.investor_interest$$, '42501', null, 'visitors cannot read interest');
select throws_ok($$insert into public.investor_interest (full_name, email, investor_type) values ('Eve', 'eve@example.com', 'other')$$,
                 '42501', null, 'or write it directly');
reset role;

set local role authenticated;
select throws_ok($$select * from public.investor_interest$$, '42501', null, 'signed-in users cannot read it either');
reset role;

select * from finish();
rollback;
