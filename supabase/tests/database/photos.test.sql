-- Booking page photos (20261025000100_business_photos.sql).
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
    ('00000000-0000-0000-0000-0000000000b1', 'other@example.com'),
    ('00000000-0000-0000-0000-0000000000c1', 'crew@example.com');
insert into public.businesses (id, owner_id, name, slug, trade, is_published, onboarding_completed_at) values
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Photo Detail', 'photo-detail', 'mobile-detailing', true, now()),
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'Other Co', 'other-co', 'x', true, now());
insert into public.business_members (business_id, user_id, role)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'crew');

set local role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a1');

select lives_ok($$
    insert into public.business_photos (business_id, storage_path, caption, sort_order)
    values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001/photos/a.webp', 'Before', 0),
           ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001/photos/b.webp', 'After', 1)
$$, 'owners add photos');
select throws_ok($$
    insert into public.business_photos (business_id, storage_path)
    values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002/photos/x.webp')
$$, '23514', null, 'a photo cannot point at another business''s folder');
select throws_ok($$
    insert into public.business_photos (business_id, storage_path)
    values ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002/photos/x.webp')
$$, '42501', null, 'owners cannot add photos to someone else''s business');
select lives_ok($$update public.business_photos set caption = 'Before the wash' where caption = 'Before'$$, 'owners caption photos');
select throws_ok($$update public.business_photos set storage_path = 'x' where caption = 'After'$$, '42501', null, 'the file path is fixed once saved');

-- Twelve is the limit.
insert into public.business_photos (business_id, storage_path, sort_order)
select '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001/photos/n' || n || '.webp', n + 1 from generate_series(1, 10) n;
select throws_ok($$
    insert into public.business_photos (business_id, storage_path)
    values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001/photos/13.webp')
$$, 'P0001', 'photo_limit', 'a page holds at most 12 photos');

select t.as_user('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.business_photos), 12, 'crew can see their business''s photos');
delete from public.business_photos;
select is((select count(*)::int from public.business_photos), 12, 'crew cannot delete photos');

select t.as_user('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.business_photos), 0, 'other businesses see none');

reset role;
set local role anon;
select throws_ok($$select * from public.business_photos$$, '42501', null, 'anon cannot read the table directly');
select is(
    (select jsonb_array_length(public.get_booking_page('photo-detail') -> 'photos')),
    12,
    'the public page includes the gallery'
);
select is(
    (select public.get_booking_page('photo-detail') -> 'photos' -> 0 ->> 'caption'),
    'Before the wash',
    'in display order, with captions'
);

reset role;
select * from finish();
rollback;
