-- Reserved booking links (20261028000100_booking_link_prefix.sql).
begin;
\set QUIET 1
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com');
insert into public.businesses (id, owner_id, name, slug, trade)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Real Co', 'real-co', 'x');

select throws_ok(
    $$insert into public.businesses (owner_id, name, slug, trade) values ('00000000-0000-0000-0000-0000000000a1', 'Fake', 'support', 'x')$$,
    '23514', null, 'a new business cannot take a reserved link');
select throws_ok(
    $$update public.businesses set slug = 'swathbook' where id = '10000000-0000-0000-0000-000000000001'$$,
    '23514', null, 'nor can an existing one switch to one');
select lives_ok(
    $$update public.businesses set slug = 'support-squad' where id = '10000000-0000-0000-0000-000000000001'$$,
    'names that only contain a reserved word are fine');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select is(public.is_slug_available('admin'), false, 'reserved links are never "available"');
select is(public.is_slug_available('ADMIN'), false, 'whatever the case');
select is(public.is_slug_available('fresh-name'), true, 'ordinary links still are');
reset role;

select * from finish();
rollback;
