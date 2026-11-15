-- =============================================================================
-- Notifications for the team: a feed of what changed on the business's jobs
-- (new bookings, payments, reschedules, cancellations and requests), with an
-- unread count, built from booking_events (the jobs' timeline).
--
--   notification_reads      When each person last caught up, per business.
--   my_notifications()      The feed and unread count, for the caller.
--   mark_notifications_read Catch up.
--
-- Both functions run as the caller, so RLS decides what they can see. Changes
-- the caller made themselves never notify them, crew only hear about their own
-- jobs, and unpaid deposit holds (which come and go on their own) are left out:
-- a booking shows up once its deposit is paid.
--
-- booking_events also joins the realtime publication, so open dashboards hear
-- about changes as they happen (Realtime applies the same RLS).
-- =============================================================================

create table public.notification_reads (
    user_id uuid not null references auth.users (id) on delete cascade,
    business_id uuid not null references public.businesses (id) on delete cascade,
    last_read_at timestamptz not null default now(),
    primary key (user_id, business_id)
);

comment on table public.notification_reads is 'When each team member last caught up on a business''s notifications.';

create index notification_reads_business_idx on public.notification_reads (business_id);

alter table public.notification_reads enable row level security;

create policy "People read their own notification state"
    on public.notification_reads for select to authenticated
    using (user_id = (select auth.uid()));
create policy "People record their own notification state"
    on public.notification_reads for insert to authenticated
    with check (user_id = (select auth.uid()) and business_id in (select private.member_business_ids()));
create policy "People update their own notification state"
    on public.notification_reads for update to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()) and business_id in (select private.member_business_ids()));

revoke all on public.notification_reads from anon, authenticated;
grant select, insert (user_id, business_id, last_read_at), update (last_read_at) on public.notification_reads to authenticated;

-- The feed reads a business's recent events newest first.
create index booking_events_business_recent_idx on public.booking_events (business_id, created_at desc);

-- -----------------------------------------------------------------------------
-- my_notifications: { unread, items: [...] }, newest first, last 30 days.
-- -----------------------------------------------------------------------------

create function public.my_notifications(p_business_id uuid, p_limit integer default 20)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    with me as (
        select (select auth.uid()) as uid
    ),
    membership as (
        select bm.id as member_id, bm.role, bm.created_at as joined_at
        from public.business_members bm
        cross join me
        where bm.business_id = p_business_id and bm.user_id = me.uid and bm.status = 'active'
    ),
    seen as (
        -- Never caught up yet: the last week (or since joining) counts as new.
        select coalesce(
            (select nr.last_read_at from public.notification_reads nr cross join me
             where nr.user_id = me.uid and nr.business_id = p_business_id),
            greatest((select joined_at from membership), now() - interval '7 days')
        ) as since
    ),
    feed as (
        select e.id, e.event_type, e.from_status, e.to_status, e.data, e.created_at,
               bk.id as booking_id, bk.reference, bk.scheduled_start, c.full_name as customer_name
        from public.booking_events e
        cross join membership m
        cross join me
        join public.bookings bk on bk.business_id = e.business_id and bk.id = e.booking_id
        left join public.customers c on c.business_id = bk.business_id and c.id = bk.customer_id
        where e.business_id = p_business_id
          and e.created_at > now() - interval '30 days'
          and e.actor_id is distinct from me.uid
          and e.event_type <> 'note'
          -- Crew hear about the jobs they're on.
          and (m.role in ('owner', 'admin') or bk.assigned_member_id = m.member_id)
          -- Unpaid holds come and go on their own; the paid deposit is the news.
          and not (e.event_type = 'created' and e.to_status = 'pending_payment')
          and not (e.event_type = 'status_changed' and e.from_status = 'pending_payment' and e.to_status = 'cancelled')
          and not (e.event_type = 'payment' and e.data ->> 'kind' = 'deposit')
    )
    select jsonb_build_object(
        'unread', (select count(*) from feed cross join seen where feed.created_at > seen.since),
        'items', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', f.id::text,
                'type', f.event_type,
                'from_status', f.from_status,
                'to_status', f.to_status,
                'data', f.data,
                'created_at', f.created_at,
                'booking_id', f.booking_id,
                'reference', f.reference,
                'scheduled_start', f.scheduled_start,
                'customer_name', f.customer_name,
                'unread', f.created_at > (select since from seen)
            ) order by f.created_at desc, f.id desc)
            from (
                select * from feed
                order by created_at desc, id desc
                limit least(greatest(coalesce(p_limit, 20), 1), 50)
            ) f
        ), '[]'::jsonb)
    );
$$;

-- Catch up on everything so far.
create function public.mark_notifications_read(p_business_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
    insert into public.notification_reads as nr (user_id, business_id, last_read_at)
    values ((select auth.uid()), p_business_id, now())
    on conflict (user_id, business_id) do update set last_read_at = excluded.last_read_at;
$$;

revoke all on function public.my_notifications(uuid, integer), public.mark_notifications_read(uuid) from public, anon, authenticated;
grant execute on function public.my_notifications(uuid, integer), public.mark_notifications_read(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Live updates: Realtime streams new booking_events to members (RLS applies).
-- -----------------------------------------------------------------------------

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
           select 1 from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'booking_events'
       ) then
        alter publication supabase_realtime add table public.booking_events;
    end if;
end;
$$;
