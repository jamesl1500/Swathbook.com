begin;
select plan(7);

-- Only the server can count hits.
set local role anon;
select throws_ok($$ select public.hit_rate_limit('t:anon', 1, 60) $$, '42501', null, 'visitors can''t call the limiter');
reset role;
set local role authenticated;
select throws_ok($$ select public.hit_rate_limit('t:user', 1, 60) $$, '42501', null, 'nor can signed-in users');
reset role;

set local role service_role;
select is(public.hit_rate_limit('t:booking', 2, 600), true, 'the first hit is allowed');
select is(public.hit_rate_limit('t:booking', 2, 600), true, 'so is the second');
select is(public.hit_rate_limit('t:booking', 2, 600), false, 'the third is over the limit');
select is(public.hit_rate_limit('t:other', 2, 600), true, 'other buckets count on their own');
select throws_ok($$ select public.hit_rate_limit('', 2, 600) $$, '22023', null, 'a bucket needs a name');
reset role;

select * from finish();
rollback;
