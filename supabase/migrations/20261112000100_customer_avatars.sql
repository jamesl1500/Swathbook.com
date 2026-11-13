-- =============================================================================
-- Customer app profile photos, plus a repair.
--
-- Profile photos live in a private avatars bucket and are set through
-- set_my_avatar(); my_details() now returns avatar_path.
--
-- Repair: public.delete_account() (20261024000100_dashboard.sql) was missing
-- from the hosted database even though that migration is recorded as applied,
-- which broke deleting an account from the dashboard. Recreated here as is.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- my_details: adds avatar_path, and counts bookings and finds the last address
-- from one shared list of this email's bookings.
-- -----------------------------------------------------------------------------

create or replace function public.my_details()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    with me as (select (select private.current_customer_email()) as email, (select auth.uid()) as uid),
    latest_customer as (
        select c.full_name, c.phone
        from public.customers c, me
        where c.email = me.email
        order by c.updated_at desc
        limit 1
    ),
    -- Every booking made with this email, at any business.
    my_bookings as (
        select bk.address_id, bk.created_at
        from me
        join public.customers c on c.email = me.email
        join public.bookings bk on bk.business_id = c.business_id and bk.customer_id = c.id
    ),
    latest_address as (
        select a.line1, a.line2, a.city, a.region, a.postal_code
        from my_bookings mb
        join public.customer_addresses a on a.id = mb.address_id
        order by mb.created_at desc
        limit 1
    ),
    home as (
        select cp.address_line1 as line1, cp.address_line2 as line2, cp.address_city as city,
               cp.address_region as region, cp.address_postal_code as postal_code
        from public.customer_profiles cp, me
        where cp.user_id = me.uid and cp.address_line1 is not null
    )
    select jsonb_build_object(
        'email', me.email,
        'full_name', coalesce(p.full_name, (select full_name from latest_customer)),
        'phone', coalesce(p.phone, (select phone from latest_customer)),
        'avatar_path', p.avatar_path,
        -- Best address to prefill a booking with: their saved home, else where they last booked.
        'address', coalesce((select to_jsonb(home) from home), (select to_jsonb(latest_address) from latest_address)),
        'home_address', (select to_jsonb(home) from home),
        'onboarded_at', (select cp.onboarded_at from public.customer_profiles cp where cp.user_id = me.uid),
        'booking_count', (select count(*) from my_bookings)
    )
    from me
    left join public.profiles p on p.id = me.uid
    where me.email is not null;
$$;

-- -----------------------------------------------------------------------------
-- Profile photos
--   avatars (private): <user_id>/<file>. Only you can read, add or remove
--   files in your folder; the app shows yours through a short-lived signed URL.
--   profiles.avatar_path changes only through set_my_avatar(), which checks the
--   file is in your folder and was uploaded by you.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Users read their own avatar files"
    on storage.objects for select to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users upload to their own avatar folder"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users delete their own avatar files"
    on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Sets (or, without a path, clears) your profile photo. Returns the previous path so
-- the app can delete that file.
create function public.set_my_avatar(p_path text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_uid uuid := (select auth.uid());
    v_previous text;
begin
    if v_uid is null then
        raise exception 'not_signed_in' using errcode = '42501';
    end if;
    if p_path is not null and (
        p_path !~ ('^' || v_uid::text || '/[0-9a-z-]{1,64}\.(jpg|png|webp)$')
        or not exists (
            select 1 from storage.objects o
            where o.bucket_id = 'avatars' and o.name = p_path and o.owner_id = v_uid::text
        )
    ) then
        raise exception 'invalid_avatar' using errcode = '22023';
    end if;

    select avatar_path into v_previous from public.profiles where id = v_uid;
    insert into public.profiles (id, avatar_path)
    values (v_uid, p_path)
    on conflict (id) do update set avatar_path = excluded.avatar_path;
    return nullif(v_previous, p_path);
end;
$$;

revoke all on function public.set_my_avatar(text) from public, anon, authenticated;
grant execute on function public.set_my_avatar(text) to authenticated, service_role;

-- Only set_my_avatar() writes avatar_path from now on.
revoke update (avatar_path) on public.profiles from authenticated;

-- -----------------------------------------------------------------------------
-- Repair: delete_account (unchanged from 20261024000100_dashboard.sql)
-- -----------------------------------------------------------------------------

create or replace function public.delete_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_upcoming integer;
begin
    select count(*) into v_upcoming
    from public.bookings bk
    join public.businesses b on b.id = bk.business_id
    where b.owner_id = p_user_id
      and bk.status in ('pending_payment', 'requested', 'confirmed', 'in_progress')
      and bk.scheduled_end > now();

    if v_upcoming > 0 then
        raise exception 'upcoming_jobs' using detail = v_upcoming::text;
    end if;

    delete from public.businesses where owner_id = p_user_id;
    delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;
