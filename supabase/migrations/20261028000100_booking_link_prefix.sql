-- =============================================================================
-- Booking links moved to swathbook.com/l/<slug>, so they can't collide with the
-- site's own pages. Some names still read as official (admin, support,
-- swathbook...) and could be used to impersonate us, so they stay reserved.
-- The app checks the same list (RESERVED_SLUGS in app/onboarding/schema.ts).
-- =============================================================================

create function private.is_reserved_slug(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select lower(p_slug) = any(array[
        'about', 'account', 'admin', 'administrator', 'api', 'app', 'auth', 'billing',
        'blog', 'book', 'booking', 'bookings', 'careers', 'contact', 'dashboard', 'features',
        'help', 'industries', 'legal', 'login', 'logout', 'official', 'onboarding', 'pay',
        'payment', 'payments', 'pricing', 'privacy', 'root', 'security', 'settings', 'signup',
        'staff', 'stripe', 'support', 'swathbook', 'system', 'team', 'terms', 'verify',
        'www'
    ]);
$$;

grant execute on function private.is_reserved_slug(text) to authenticated, service_role;

-- NOT VALID: enforced for every new or changed slug without failing on any
-- existing row that predates the rule.
alter table public.businesses
    add constraint businesses_slug_not_reserved check (not private.is_reserved_slug(slug)) not valid;

create or replace function public.is_slug_available(p_slug text, p_business_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select not private.is_reserved_slug(p_slug)
       and not exists (
           select 1 from public.businesses
           where slug = lower(p_slug)
             and (p_business_id is null or id <> p_business_id or id not in (select private.managed_business_ids()))
       );
$$;
