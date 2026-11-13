-- =============================================================================
-- Customer app: business search, and signed-in customers' own bookings.
--
-- A customer account is an ordinary auth user. Their bookings are the ones
-- whose customer email, at any business, matches their *confirmed* login
-- email. So bookings made on the website before they ever opened the app show
-- up too, and nobody sees a booking without proving they own its email.
--
-- Changes go through the existing token functions (customer_reschedule_booking,
-- customer_cancel_booking) after an ownership check, so the app and the
-- emailed "manage booking" link follow exactly the same rules.
-- =============================================================================

-- Cross-business lookups by email (the existing index leads with business_id).
create index customers_email_idx on public.customers (email) where email is not null;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- The caller's login email, only once it has been confirmed.
create function private.current_customer_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select lower(u.email)
    from auth.users u
    where u.id = (select auth.uid()) and u.email is not null and u.email_confirmed_at is not null;
$$;

-- The caller's booking, or no row when it isn't theirs.
create function private.my_booking_row(p_booking_id uuid)
returns setof public.bookings
language sql
stable
security definer
set search_path = ''
as $$
    select bk.*
    from public.bookings bk
    join public.customers c on c.id = bk.customer_id and c.business_id = bk.business_id
    where bk.id = p_booking_id and c.email = (select private.current_customer_email());
$$;

-- Everything the app shows for one booking. Never includes the business's
-- private fields (base address, internal notes, crew).
create function private.customer_booking_json(bk public.bookings)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'id', bk.id,
        'reference', bk.reference,
        -- An unpaid hold that has run out is as good as cancelled (the slot is free again).
        'status', case when bk.status = 'pending_payment' and bk.hold_expires_at <= now() then 'cancelled' else bk.status::text end,
        'scheduled_start', bk.scheduled_start,
        'scheduled_end', bk.scheduled_end,
        'hold_expires_at', bk.hold_expires_at,
        'currency', bk.currency,
        'subtotal_cents', bk.subtotal_cents,
        'discount_cents', bk.discount_cents,
        'tax_cents', bk.tax_cents,
        'tip_cents', bk.tip_cents,
        'total_cents', bk.total_cents,
        'deposit_due_cents', bk.deposit_due_cents,
        'deposit_paid_cents', bk.deposit_paid_cents,
        'amount_paid_cents', bk.amount_paid_cents,
        'amount_refunded_cents', bk.amount_refunded_cents,
        'balance_due_cents', bk.balance_due_cents,
        'customer_notes', bk.customer_notes,
        'cancel_requested_at', bk.cancel_requested_at,
        'cancellation_reason', bk.cancellation_reason,
        -- The customer's own key to the web "manage booking" page (payments live there).
        'public_token', bk.public_token,
        'business', jsonb_build_object(
            'id', b.id,
            'name', b.name,
            'slug', b.slug,
            'trade', b.trade,
            'brand_color', b.brand_color,
            'logo_path', b.logo_path,
            'phone', b.phone,
            'email', b.email,
            'timezone', b.timezone,
            'cancellation_window_hours', b.cancellation_window_hours,
            'deposit_refund_policy', b.deposit_refund_policy,
            'accepts_online_payments', coalesce(sca.charges_enabled, false),
            'is_bookable', b.is_published and private.business_has_access(b.id)
        ),
        'items', coalesce((
            select jsonb_agg(jsonb_build_object(
                'name', i.name,
                'quantity', i.quantity,
                'line_total_cents', i.line_total_cents,
                'duration_minutes', i.duration_minutes
            ) order by i.sort_order, i.created_at)
            from public.booking_items i
            where i.business_id = bk.business_id and i.booking_id = bk.id
        ), '[]'::jsonb),
        'address', case when a.id is null then null else jsonb_build_object(
            'line1', a.line1,
            'line2', a.line2,
            'city', a.city,
            'region', a.region,
            'postal_code', a.postal_code
        ) end,
        'options', public.customer_booking_options(bk.public_token)
    )
    from public.businesses b
    left join public.stripe_connect_accounts sca on sca.business_id = b.id
    left join public.customer_addresses a on a.id = bk.address_id
    where b.id = bk.business_id;
$$;

revoke all on function private.current_customer_email(), private.my_booking_row(uuid),
    private.customer_booking_json(public.bookings)
from public, anon, authenticated;
grant execute on function private.current_customer_email(), private.my_booking_row(uuid),
    private.customer_booking_json(public.bookings)
to service_role;

-- -----------------------------------------------------------------------------
-- Search (anyone, signed in or not)
-- -----------------------------------------------------------------------------

-- Published, paid-up businesses with at least one bookable service. Matches
-- the name, trade, service area, description or any service's name.
create function public.search_businesses(
    p_query text default null,
    p_trade text default null,
    p_limit integer default 20,
    p_offset integer default 0
)
returns table (
    id uuid,
    name text,
    slug text,
    trade text,
    description text,
    service_area text,
    brand_color text,
    logo_path text,
    accepts_online_payments boolean,
    service_count integer,
    from_price_cents integer,
    total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
    with q as (
        -- Escape LIKE wildcards so "%" or "_" in a search are taken literally.
        select nullif(
            replace(replace(replace(lower(trim(left(coalesce(p_query, ''), 100))), '\', '\\'), '%', '\%'), '_', '\_'),
            ''
        ) as term
    )
    select b.id, b.name, b.slug, b.trade, b.description, b.service_area, b.brand_color, b.logo_path,
           coalesce(sca.charges_enabled, false),
           svc.service_count::integer,
           svc.from_price_cents::integer,
           count(*) over ()
    from public.businesses b
    cross join q
    left join public.stripe_connect_accounts sca on sca.business_id = b.id
    cross join lateral (
        select count(*) as service_count,
               min(s.price_cents) filter (where s.price_type <> 'quote' and s.price_cents > 0) as from_price_cents
        from public.services s
        where s.business_id = b.id and s.is_active and s.is_public
    ) svc
    where b.is_published
      and private.business_has_access(b.id)
      and svc.service_count > 0
      and (nullif(trim(p_trade), '') is null or b.trade = trim(p_trade))
      and (
          q.term is null
          or lower(b.name) like '%' || q.term || '%' escape '\'
          or replace(b.trade, '-', ' ') like '%' || q.term || '%' escape '\'
          or lower(coalesce(b.service_area, '')) like '%' || q.term || '%' escape '\'
          or lower(coalesce(b.description, '')) like '%' || q.term || '%' escape '\'
          or exists (
              select 1 from public.services s
              where s.business_id = b.id and s.is_active and s.is_public
                and lower(s.name) like '%' || q.term || '%' escape '\'
          )
      )
    order by
        case
            when q.term is null then 2
            when lower(b.name) like q.term || '%' escape '\' then 0
            when lower(b.name) like '%' || q.term || '%' escape '\' then 1
            else 2
        end,
        lower(b.name),
        b.id
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
    offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.search_businesses(text, text, integer, integer) is
    'Customer app search over bookable businesses. Public fields only; total_count is the match count before paging.';

-- Trades that have at least one bookable business, for the search filter chips.
create function public.business_trades()
returns table (trade text, business_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
    select b.trade, count(*)
    from public.businesses b
    where b.is_published
      and private.business_has_access(b.id)
      and exists (select 1 from public.services s where s.business_id = b.id and s.is_active and s.is_public)
    group by b.trade
    order by count(*) desc, b.trade;
$$;

-- -----------------------------------------------------------------------------
-- The signed-in customer's own bookings
-- -----------------------------------------------------------------------------

-- Every booking at every business made with the caller's confirmed email,
-- oldest first (the 200 most recent). An empty list until the email is confirmed.
create function public.my_bookings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(jsonb_agg(private.customer_booking_json(bk) order by bk.scheduled_start, bk.id), '[]'::jsonb)
    from public.bookings bk
    where bk.id in (
        select mine.id
        from public.customers c
        join public.bookings mine on mine.business_id = c.business_id and mine.customer_id = c.id
        where c.email = (select private.current_customer_email())
        order by mine.scheduled_start desc
        limit 200
    );
$$;

-- One of the caller's bookings, or NULL when it isn't theirs.
create function public.my_booking(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select private.customer_booking_json(bk) from private.my_booking_row(p_booking_id) bk;
$$;

-- Name, phone and last service address, to prefill the booking form.
create function public.my_details()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    with me as (select (select private.current_customer_email()) as email),
    latest_customer as (
        select c.full_name, c.phone
        from public.customers c, me
        where c.email = me.email
        order by c.updated_at desc
        limit 1
    ),
    latest_address as (
        select a.line1, a.line2, a.city, a.region, a.postal_code
        from public.customers c
        cross join me
        join public.bookings bk on bk.business_id = c.business_id and bk.customer_id = c.id
        join public.customer_addresses a on a.id = bk.address_id
        where c.email = me.email
        order by bk.created_at desc
        limit 1
    )
    select jsonb_build_object(
        'email', me.email,
        'full_name', coalesce(p.full_name, (select full_name from latest_customer)),
        'phone', coalesce(p.phone, (select phone from latest_customer)),
        'address', (select to_jsonb(latest_address) from latest_address)
    )
    from me
    left join public.profiles p on p.id = (select auth.uid())
    where me.email is not null;
$$;

-- Open times to move one of the caller's bookings to.
create function public.my_reschedule_slots(p_booking_id uuid, p_from date default null, p_days integer default 7)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_token text;
begin
    select bk.public_token into v_token from private.my_booking_row(p_booking_id) bk;
    if v_token is null then
        return;
    end if;
    return query
    select s.slot_start, s.slot_end
    from public.get_reschedule_slots(v_token, p_from, least(greatest(coalesce(p_days, 7), 1), 14)) s;
end;
$$;

create function public.reschedule_my_booking(p_booking_id uuid, p_start timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_token text;
begin
    select bk.public_token into v_token from private.my_booking_row(p_booking_id) bk;
    if v_token is null then
        raise exception 'booking_not_found' using errcode = 'P0002';
    end if;
    return public.customer_reschedule_booking(v_token, p_start);
end;
$$;

-- 'cancelled' (not yet accepted, so it's gone) or 'requested' (the business decides).
create function public.cancel_my_booking(p_booking_id uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_token text;
begin
    select bk.public_token into v_token from private.my_booking_row(p_booking_id) bk;
    if v_token is null then
        raise exception 'booking_not_found' using errcode = 'P0002';
    end if;
    return public.customer_cancel_booking(v_token, p_reason);
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants. Supabase grants new public functions to anon and authenticated by
-- default; revoke those and grant exactly what each caller needs.
-- -----------------------------------------------------------------------------

revoke all on function public.search_businesses(text, text, integer, integer), public.business_trades(),
    public.my_bookings(), public.my_booking(uuid), public.my_details(),
    public.my_reschedule_slots(uuid, date, integer), public.reschedule_my_booking(uuid, timestamptz),
    public.cancel_my_booking(uuid, text)
from public, anon, authenticated;

grant execute on function public.search_businesses(text, text, integer, integer), public.business_trades()
to anon, authenticated, service_role;

grant execute on function public.my_bookings(), public.my_booking(uuid), public.my_details(),
    public.my_reschedule_slots(uuid, date, integer), public.reschedule_my_booking(uuid, timestamptz),
    public.cancel_my_booking(uuid, text)
to authenticated, service_role;
