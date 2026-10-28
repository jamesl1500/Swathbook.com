-- =============================================================================
-- Local SEO for booking pages: a public "service area" (e.g. "Austin, Round
-- Rock & Cedar Park, TX"). Most local searches name a place; the business's
-- base address is private, so this is what pages, titles and structured data
-- use instead. (Function body copied from 20261026000100_billing.sql.)
-- =============================================================================

alter table public.businesses
    add column service_area text check (char_length(service_area) <= 120);
comment on column public.businesses.service_area is 'Public: the towns or area served, shown on the booking page and used for search.';

grant insert (service_area), update (service_area) on public.businesses to authenticated;

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
            'service_area', b.service_area,
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
    where b.slug = lower(p_slug) and b.is_published and private.business_has_access(b.id);
$$;
