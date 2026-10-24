-- =============================================================================
-- Booking page photos: a gallery of the business's work, shown on its public
-- page. Files live in the public business-assets bucket under
-- <business_id>/photos/; this table orders and captions them.
-- =============================================================================

create table public.business_photos (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    storage_path text not null check (char_length(storage_path) <= 512),
    caption text check (char_length(caption) <= 140),
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (business_id, id),
    -- A row can only point at its own business's folder.
    constraint business_photos_path_in_business_folder
        check (storage_path like business_id::text || '/photos/%')
);

comment on table public.business_photos is 'Gallery photos for a business''s public booking page.';

create index business_photos_business_sort_idx on public.business_photos (business_id, sort_order, created_at);

create trigger business_photos_set_updated_at
    before update on public.business_photos
    for each row execute function private.set_updated_at();

-- Keep galleries small enough to load fast on a phone.
create function private.enforce_photo_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform pg_advisory_xact_lock(hashtext('business_photos:' || new.business_id::text));
    if (select count(*) from public.business_photos where business_id = new.business_id) >= 12 then
        raise exception 'photo_limit' using detail = 'A booking page can show up to 12 photos.';
    end if;
    return new;
end;
$$;

revoke all on function private.enforce_photo_limit() from public, anon, authenticated;

create trigger business_photos_enforce_limit
    before insert on public.business_photos
    for each row execute function private.enforce_photo_limit();

alter table public.business_photos enable row level security;

create policy "Members read photos"
    on public.business_photos for select to authenticated
    using (business_id in (select private.member_business_ids()));
create policy "Owners and admins add photos"
    on public.business_photos for insert to authenticated
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins edit photos"
    on public.business_photos for update to authenticated
    using (business_id in (select private.managed_business_ids()))
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins remove photos"
    on public.business_photos for delete to authenticated
    using (business_id in (select private.managed_business_ids()));

revoke all on public.business_photos from anon, authenticated;
grant select, delete on public.business_photos to authenticated;
grant insert (business_id, storage_path, caption, sort_order) on public.business_photos to authenticated;
grant update (caption, sort_order) on public.business_photos to authenticated;
grant all on public.business_photos to service_role;

-- -----------------------------------------------------------------------------
-- The public page now also returns the gallery.
-- -----------------------------------------------------------------------------
create or replace function public.get_booking_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'business', jsonb_build_object(
            'id', b.id,
            'name', b.name,
            'slug', b.slug,
            'trade', b.trade,
            'description', b.description,
            'phone', b.phone,
            'email', b.email,
            'website_url', b.website_url,
            'logo_path', b.logo_path,
            'cover_path', b.cover_path,
            'brand_color', b.brand_color,
            'timezone', b.timezone,
            'currency', b.currency,
            'service_radius_miles', b.service_radius_miles,
            'cancellation_window_hours', b.cancellation_window_hours,
            'deposit_refund_policy', b.deposit_refund_policy,
            'accepts_online_payments', coalesce(sca.charges_enabled, false)
        ),
        'services', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', s.id,
                'name', s.name,
                'description', s.description,
                'price_type', s.price_type,
                'price_cents', s.price_cents,
                'duration_minutes', s.duration_minutes,
                'deposit_cents', case when coalesce(sca.charges_enabled, false) then private.service_deposit_cents(s) else 0 end
            ) order by s.sort_order, s.name)
            from public.services s
            where s.business_id = b.id and s.is_active and s.is_public
        ), '[]'::jsonb),
        'hours', coalesce((
            select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens_at', h.opens_at, 'closes_at', h.closes_at)
                             order by h.weekday)
            from public.business_hours h
            where h.business_id = b.id
        ), '[]'::jsonb),
        'photos', coalesce((
            select jsonb_agg(jsonb_build_object('id', p.id, 'storage_path', p.storage_path, 'caption', p.caption)
                             order by p.sort_order, p.created_at, p.id)
            from public.business_photos p
            where p.business_id = b.id
        ), '[]'::jsonb)
    )
    from public.businesses b
    left join public.stripe_connect_accounts sca on sca.business_id = b.id
    where b.slug = lower(p_slug) and b.is_published;
$$;
