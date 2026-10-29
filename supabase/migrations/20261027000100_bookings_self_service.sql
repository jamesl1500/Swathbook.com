-- =============================================================================
-- Bookings list for owners, and self-service for customers.
--
-- Customers (through their private booking link) can:
--   * reschedule to another open time, outside the cancellation window and
--     up to 3 times, when the business allows it;
--   * cancel a booking that hasn't been accepted yet, or ask to cancel a
--     confirmed one. Owners approve or decline the request.
-- =============================================================================

alter table public.businesses
    add column allow_customer_reschedule boolean not null default true;
comment on column public.businesses.allow_customer_reschedule is 'Customers may move their own booking (outside the cancellation window).';

grant insert (allow_customer_reschedule), update (allow_customer_reschedule) on public.businesses to authenticated;

alter table public.bookings
    add column cancel_requested_at timestamptz,
    add column cancel_request_reason text check (char_length(cancel_request_reason) <= 500),
    add column customer_reschedule_count integer not null default 0 check (customer_reschedule_count between 0 and 10);

create index bookings_cancel_requests_idx on public.bookings (business_id, cancel_requested_at) where cancel_requested_at is not null;

alter table public.booking_events drop constraint booking_events_event_type_check;
alter table public.booking_events add constraint booking_events_event_type_check
    check (event_type in ('created', 'status_changed', 'rescheduled', 'reassigned', 'payment', 'note', 'cancel_requested', 'cancel_request_resolved'));

-- -----------------------------------------------------------------------------
-- Slot engine: optionally ignore one booking (the one being moved).
-- -----------------------------------------------------------------------------

drop function private.available_slots(uuid, integer, date, integer);
drop function private.free_members(uuid, timestamptz, timestamptz);

create function private.free_members(p_business_id uuid, p_start timestamptz, p_end timestamptz, p_ignore_booking uuid default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
    select m.id
    from public.business_members m
    join public.businesses b on b.id = m.business_id
    where m.business_id = p_business_id
      and m.status = 'active'
      and m.is_bookable
      and not exists (
          select 1 from public.bookings bk
          where bk.business_id = p_business_id
            and bk.assigned_member_id = m.id
            and bk.id is distinct from p_ignore_booking
            and private.booking_is_active(bk.status, bk.hold_expires_at)
            and bk.scheduled_range && tstzrange(
                p_start - make_interval(mins => b.buffer_minutes),
                p_end + make_interval(mins => b.buffer_minutes), '[)')
      )
      and not exists (
          select 1 from public.time_off t
          where t.business_id = p_business_id
            and t.member_id = m.id
            and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(p_start, p_end, '[)')
      );
$$;

create function private.available_slots(
    p_business_id uuid,
    p_duration_minutes integer,
    p_from date,
    p_days integer,
    p_ignore_booking uuid default null
)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    b public.businesses%rowtype;
    v_today date;
    v_from date;
    v_to date;
    v_duration interval := make_interval(mins => p_duration_minutes);
begin
    select * into b from public.businesses where id = p_business_id;
    if not found or p_duration_minutes is null or p_duration_minutes <= 0 then
        return;
    end if;

    v_today := (now() at time zone b.timezone)::date;
    v_from := greatest(coalesce(p_from, v_today), v_today);
    v_to := least(v_from + greatest(least(coalesce(p_days, 14), 62), 1) - 1, v_today + b.booking_window_days);

    return query
    with days as (
        select d::date as day
        from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') as d
    ),
    windows as (
        select (days.day + h.opens_at) at time zone b.timezone as open_at,
               (days.day + h.closes_at) at time zone b.timezone as close_at
        from days
        join public.business_hours h
          on h.business_id = b.id and h.weekday = extract(dow from days.day)::smallint
    ),
    candidates as (
        select s as start_at, s + v_duration as end_at
        from windows w
        cross join lateral generate_series(w.open_at, w.close_at - v_duration, make_interval(mins => b.slot_interval_minutes)) as s
    )
    select c.start_at, c.end_at
    from candidates c
    where c.start_at >= now() + make_interval(mins => b.booking_lead_time_minutes)
      and not exists (
          select 1 from public.time_off t
          where t.business_id = b.id
            and t.member_id is null
            and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(c.start_at, c.end_at, '[)')
      )
      and (
          (select count(*) from private.free_members(b.id, c.start_at, c.end_at, p_ignore_booking))
          - (select count(*) from public.bookings bk
             where bk.business_id = b.id
               and bk.assigned_member_id is null
               and bk.id is distinct from p_ignore_booking
               and private.booking_is_active(bk.status, bk.hold_expires_at)
               and bk.scheduled_range && tstzrange(
                   c.start_at - make_interval(mins => b.buffer_minutes),
                   c.end_at + make_interval(mins => b.buffer_minutes), '[)'))
      ) > 0
    order by c.start_at;
end;
$$;

revoke all on function private.free_members(uuid, timestamptz, timestamptz, uuid),
    private.available_slots(uuid, integer, date, integer, uuid) from public, anon, authenticated;
grant execute on function private.free_members(uuid, timestamptz, timestamptz, uuid),
    private.available_slots(uuid, integer, date, integer, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Customer self-service (by booking token, so it works from email links).
-- -----------------------------------------------------------------------------

-- What the customer's booking page can offer right now.
create function public.customer_booking_options(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'can_reschedule', bk.status in ('confirmed', 'requested') and bk.cancel_requested_at is null
            and b.allow_customer_reschedule and private.business_has_access(b.id)
            and bk.customer_reschedule_count < 3
            and bk.scheduled_start > now() + make_interval(hours => b.cancellation_window_hours),
        'reschedule_blocked_reason', case
            when bk.status not in ('confirmed', 'requested') then 'status'
            when bk.cancel_requested_at is not null then 'cancel_requested'
            when not b.allow_customer_reschedule then 'not_offered'
            when bk.customer_reschedule_count >= 3 then 'limit'
            when bk.scheduled_start <= now() + make_interval(hours => b.cancellation_window_hours) then 'too_late'
        end,
        'can_cancel', bk.status in ('confirmed', 'requested') and bk.cancel_requested_at is null and bk.scheduled_start > now(),
        'cancel_is_request', bk.status = 'confirmed',
        'cancel_requested_at', bk.cancel_requested_at,
        'cancellation_window_hours', b.cancellation_window_hours,
        'deposit_refund_policy', b.deposit_refund_policy,
        'reschedules_left', greatest(0, 3 - bk.customer_reschedule_count)
    )
    from public.bookings bk
    join public.businesses b on b.id = bk.business_id
    where p_token ~ '^[0-9a-f]{64}$' and bk.public_token = p_token;
$$;

create function public.get_reschedule_slots(p_token text, p_from date default null, p_days integer default 7)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_booking public.bookings%rowtype;
    v_options jsonb := public.customer_booking_options(p_token);
begin
    if v_options is null or not (v_options ->> 'can_reschedule')::boolean then
        return;
    end if;
    select * into v_booking from public.bookings where public_token = p_token;
    return query
    select s.slot_start, s.slot_end
    from private.available_slots(
        v_booking.business_id,
        (extract(epoch from v_booking.scheduled_end - v_booking.scheduled_start) / 60)::integer,
        p_from, p_days, v_booking.id) s
    where s.slot_start <> v_booking.scheduled_start;
end;
$$;

create function public.customer_reschedule_booking(p_token text, p_start timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
    b public.businesses%rowtype;
    v_booking public.bookings%rowtype;
    v_minutes integer;
    v_end timestamptz;
    v_member uuid;
    v_options jsonb;
begin
    select * into v_booking from public.bookings where p_token ~ '^[0-9a-f]{64}$' and public_token = p_token;
    if not found then
        raise exception 'booking_not_found' using errcode = 'P0002';
    end if;
    -- Same lock as create_booking, so a reschedule and a new booking can't both take the last slot.
    select * into b from public.businesses where id = v_booking.business_id for update;
    select * into v_booking from public.bookings where id = v_booking.id for update;

    v_options := public.customer_booking_options(p_token);
    if not (v_options ->> 'can_reschedule')::boolean then
        raise exception 'reschedule_not_allowed' using errcode = 'P0001', detail = coalesce(v_options ->> 'reschedule_blocked_reason', 'status');
    end if;

    v_minutes := (extract(epoch from v_booking.scheduled_end - v_booking.scheduled_start) / 60)::integer;
    v_end := p_start + make_interval(mins => v_minutes);
    if p_start = v_booking.scheduled_start or not exists (
        select 1 from private.available_slots(b.id, v_minutes, (p_start at time zone b.timezone)::date, 1, v_booking.id) s
        where s.slot_start = p_start
    ) then
        raise exception 'slot_unavailable' using errcode = 'P0001';
    end if;

    -- Keep the same crew member when they're free; otherwise anyone free (or unassigned).
    if v_booking.assigned_member_id is not null
       and v_booking.assigned_member_id in (select private.free_members(b.id, p_start, v_end, v_booking.id)) then
        v_member := v_booking.assigned_member_id;
    else
        select fm into v_member from private.free_members(b.id, p_start, v_end, v_booking.id) as fm limit 1;
    end if;

    update public.bookings
    set scheduled_start = p_start, scheduled_end = v_end, assigned_member_id = v_member,
        customer_reschedule_count = customer_reschedule_count + 1
    where id = v_booking.id;

    perform private.enqueue_notification(
        (select x from public.bookings x where x.id = v_booking.id), 'owner.customer_rescheduled',
        (select coalesce(b.email, u.email) from auth.users u where u.id = b.owner_id), false, now(),
        jsonb_build_object('previous_start', v_booking.scheduled_start));
    return p_start;
end;
$$;

-- Unaccepted requests are cancelled right away; confirmed bookings become a request.
create function public.customer_cancel_booking(p_token text, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    b public.businesses%rowtype;
    v_booking public.bookings%rowtype;
    v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
    v_owner_email text;
begin
    select * into v_booking from public.bookings where p_token ~ '^[0-9a-f]{64}$' and public_token = p_token for update;
    if not found then
        raise exception 'booking_not_found' using errcode = 'P0002';
    end if;
    if v_booking.status not in ('confirmed', 'requested') or v_booking.cancel_requested_at is not null or v_booking.scheduled_start <= now() then
        raise exception 'cancel_not_allowed' using errcode = 'P0001';
    end if;
    select * into b from public.businesses where id = v_booking.business_id;
    select coalesce(b.email, u.email) into v_owner_email from auth.users u where u.id = b.owner_id;

    if v_booking.status = 'requested' then
        update public.bookings
        set status = 'cancelled', cancellation_reason = coalesce('Cancelled by the customer: ' || v_reason, 'Cancelled by the customer')
        where id = v_booking.id;
        perform private.enqueue_notification((select x from public.bookings x where x.id = v_booking.id), 'owner.customer_cancelled', v_owner_email, false);
        return 'cancelled';
    end if;

    update public.bookings set cancel_requested_at = now(), cancel_request_reason = v_reason where id = v_booking.id;
    insert into public.booking_events (business_id, booking_id, event_type, data)
    values (v_booking.business_id, v_booking.id, 'cancel_requested', jsonb_build_object('reason', v_reason));
    select * into v_booking from public.bookings where id = v_booking.id;
    perform private.enqueue_notification(v_booking, 'owner.cancel_request', v_owner_email, false);
    perform private.enqueue_notification(v_booking, 'booking.cancel_requested', (select email from public.customers where id = v_booking.customer_id), true);
    return 'requested';
end;
$$;

-- Owners and admins answer a cancellation request.
create function public.resolve_cancel_request(p_booking_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_booking public.bookings%rowtype;
    v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
begin
    select * into v_booking from public.bookings where id = p_booking_id for update;
    if not found or v_booking.business_id not in (select private.managed_business_ids()) then
        raise exception 'not_allowed' using errcode = '42501';
    end if;
    if v_booking.cancel_requested_at is null then
        raise exception 'no_cancel_request' using errcode = 'P0001';
    end if;

    insert into public.booking_events (business_id, booking_id, event_type, actor_id, data)
    values (v_booking.business_id, v_booking.id, 'cancel_request_resolved', (select auth.uid()),
            jsonb_build_object('approved', p_approve, 'note', v_note));

    if p_approve then
        update public.bookings
        set status = 'cancelled', cancellation_reason = 'Cancelled at the customer''s request',
            cancel_requested_at = null, cancel_request_reason = null
        where id = v_booking.id;
    else
        update public.bookings set cancel_requested_at = null, cancel_request_reason = null where id = v_booking.id;
        perform private.enqueue_notification(
            (select x from public.bookings x where x.id = v_booking.id), 'booking.cancel_declined',
            (select email from public.customers where id = v_booking.customer_id), true, now(),
            jsonb_build_object('note', v_note));
    end if;
end;
$$;

-- Supabase grants new public functions to anon and authenticated by default; revoke those explicitly.
revoke all on function public.customer_booking_options(text), public.get_reschedule_slots(text, date, integer),
    public.customer_reschedule_booking(text, timestamptz), public.customer_cancel_booking(text, text)
from public, anon, authenticated;
revoke all on function public.resolve_cancel_request(uuid, boolean, text) from public, anon;
-- Token functions run from the server (service role); the token is the customer's key.
grant execute on function public.customer_booking_options(text), public.get_reschedule_slots(text, date, integer),
    public.customer_reschedule_booking(text, timestamptz), public.customer_cancel_booking(text, text) to service_role;
grant execute on function public.resolve_cancel_request(uuid, boolean, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Owner's bookings list: filters, search and paging in one round trip.
-- Security invoker, so RLS decides which bookings the caller can see.
-- -----------------------------------------------------------------------------

create function public.booking_list(
    p_business_id uuid,
    p_statuses public.booking_status[] default null,
    p_from timestamptz default null,
    p_to timestamptz default null,
    p_member_id uuid default null,
    p_unassigned boolean default false,
    p_cancel_requests boolean default false,
    p_search text default null,
    p_newest_first boolean default false,
    p_limit integer default 25,
    p_offset integer default 0
)
returns table (
    id uuid,
    reference text,
    status public.booking_status,
    source public.booking_source,
    scheduled_start timestamptz,
    scheduled_end timestamptz,
    currency text,
    total_cents integer,
    deposit_due_cents integer,
    deposit_paid_cents integer,
    balance_due_cents integer,
    hold_expires_at timestamptz,
    cancel_requested_at timestamptz,
    cancel_request_reason text,
    customer_id uuid,
    customer_name text,
    customer_email text,
    customer_phone text,
    services text,
    assigned_member_id uuid,
    total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
    select bk.id, bk.reference, bk.status, bk.source, bk.scheduled_start, bk.scheduled_end, bk.currency,
           bk.total_cents, bk.deposit_due_cents, bk.deposit_paid_cents, bk.balance_due_cents, bk.hold_expires_at,
           bk.cancel_requested_at, bk.cancel_request_reason,
           c.id, c.full_name, c.email, c.phone,
           (select string_agg(i.name, ', ' order by i.sort_order) from public.booking_items i where i.booking_id = bk.id),
           bk.assigned_member_id,
           count(*) over ()
    from public.bookings bk
    join public.customers c on c.id = bk.customer_id
    where bk.business_id = p_business_id
      and (p_statuses is null or bk.status = any(p_statuses))
      and (p_from is null or bk.scheduled_start >= p_from)
      and (p_to is null or bk.scheduled_start < p_to)
      and (p_member_id is null or bk.assigned_member_id = p_member_id)
      and (not p_unassigned or bk.assigned_member_id is null)
      and (not p_cancel_requests or bk.cancel_requested_at is not null)
      and (nullif(trim(p_search), '') is null
           or c.search_text like '%' || lower(trim(p_search)) || '%'
           or bk.reference ilike trim(p_search) || '%')
    order by
        case when p_newest_first then bk.scheduled_start end desc,
        case when not p_newest_first then bk.scheduled_start end asc,
        bk.id
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

-- Tab counts for the bookings page.
create function public.booking_counts(p_business_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select jsonb_build_object(
        'upcoming', count(*) filter (where bk.scheduled_start >= now() and bk.status in ('pending_payment', 'requested', 'confirmed', 'in_progress')),
        'requests', count(*) filter (where bk.status = 'requested'),
        'cancel_requests', count(*) filter (where bk.cancel_requested_at is not null),
        'awaiting_deposit', count(*) filter (where bk.status = 'pending_payment'),
        'today', count(*) filter (where (bk.scheduled_start at time zone b.timezone)::date = (now() at time zone b.timezone)::date
                                   and bk.status in ('confirmed', 'in_progress', 'completed'))
    )
    from public.bookings bk
    join public.businesses b on b.id = bk.business_id
    where bk.business_id = p_business_id;
$$;

revoke all on function public.booking_list(uuid, public.booking_status[], timestamptz, timestamptz, uuid, boolean, boolean, text, boolean, integer, integer),
    public.booking_counts(uuid) from public, anon;
grant execute on function public.booking_list(uuid, public.booking_status[], timestamptz, timestamptz, uuid, boolean, boolean, text, boolean, integer, integer),
    public.booking_counts(uuid) to authenticated, service_role;

-- New columns the team reads: request details are visible like the rest of the booking.
grant select (cancel_requested_at, cancel_request_reason, customer_reschedule_count) on public.bookings to authenticated;
