-- =============================================================================
-- Rain days and property notes.
--
-- Rain days: when rain is forecast (the app checks Google's Weather API), the
-- owner moves a day's weather-dependent jobs to another day in one go.
-- plan_rain_delay() works out where each job lands (same crew member and time
-- when free, else the closest open slot, else someone else) and, when asked to
-- apply, moves them and emails each customer once ('booking.rain_delay')
-- instead of the usual reschedule email.
--
--   services.weather_dependent       rain stops this job (default yes)
--   businesses.rain_alerts_enabled   warn about rain on days with jobs
--   businesses.rain_alert_percent    chance of rain that counts as a rain day
--   rain_delays                      one row per day moved, for the record
--   bookings.rain_delay_id           the rain delay that last moved this job
--
-- Property notes: what the crew should know about an address, beyond the
-- existing access notes: the gate code, pets, and a map of pins (gate, dog,
-- hazard, spigot...) and areas (keep off, careful). Anyone on the team can
-- edit them through save_property_notes(), since crews are the ones who find
-- the loose board in the fence.
--
--   customer_addresses.gate_code
--   customer_addresses.pets
--   customer_addresses.property_map  { markers: [{ kind, label, lat, lng }],
--                                      areas: [{ kind, label, points: [[lat, lng], ...] }] }
--                                    Shape is checked by the app; here only the size.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Columns
-- -----------------------------------------------------------------------------

alter table public.services
    add column weather_dependent boolean not null default true;
comment on column public.services.weather_dependent is 'Rain stops this job, so rain days offer to move it.';
grant insert (weather_dependent), update (weather_dependent) on public.services to authenticated;

alter table public.businesses
    add column rain_alerts_enabled boolean not null default true,
    add column rain_alert_percent integer not null default 60 check (rain_alert_percent between 30 and 100);
comment on column public.businesses.rain_alert_percent is 'Chance of rain (daytime) at which a day with jobs is flagged.';
grant insert (rain_alerts_enabled, rain_alert_percent), update (rain_alerts_enabled, rain_alert_percent) on public.businesses to authenticated;

alter table public.customer_addresses
    add column gate_code text check (char_length(gate_code) <= 40),
    add column pets text check (char_length(pets) <= 200),
    add column property_map jsonb check (jsonb_typeof(property_map) = 'object' and pg_column_size(property_map) <= 32768);
comment on column public.customer_addresses.gate_code is 'Gate or door code for the crew.';
comment on column public.customer_addresses.pets is 'Pets at the property, e.g. "Friendly lab, keep the gate shut".';
comment on column public.customer_addresses.property_map is 'Pins and areas on the property for the crew: { markers: [...], areas: [...] }.';

create table public.rain_delays (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    rain_date date not null,
    moved_to date not null,
    moved_count integer not null default 0 check (moved_count >= 0),
    left_count integer not null default 0 check (left_count >= 0),
    -- What the forecast said when the owner decided (chance, summary), if known.
    forecast jsonb check (jsonb_typeof(forecast) = 'object'),
    created_by uuid default auth.uid() references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    unique (business_id, id),
    check (moved_to <> rain_date)
);

comment on table public.rain_delays is 'A day of jobs moved because of rain. Written by plan_rain_delay().';

create index rain_delays_business_idx on public.rain_delays (business_id, created_at desc);
create index rain_delays_created_by_idx on public.rain_delays (created_by);

alter table public.rain_delays enable row level security;
create policy "Members read rain delays"
    on public.rain_delays for select to authenticated
    using (business_id in (select private.member_business_ids()));
revoke all on public.rain_delays from anon, authenticated;
grant select on public.rain_delays to authenticated;

alter table public.bookings
    add column rain_delay_id uuid,
    add constraint bookings_rain_delay_fk foreign key (business_id, rain_delay_id)
        references public.rain_delays (business_id, id) on delete set null (rain_delay_id);
create index bookings_rain_delay_idx on public.bookings (business_id, rain_delay_id) where rain_delay_id is not null;

-- -----------------------------------------------------------------------------
-- plan_rain_delay: move p_from's weather-dependent jobs to p_to.
--   p_skip      jobs the owner chose to leave where they are
--   p_apply     false = a preview (nothing changes), true = move them
--   p_forecast  kept on the rain_delays row
-- Returns { rain_delay_id, moves: [{ booking_id, from_start, to_start, to_end,
-- member_id, reassigned }], unplaced: [booking_id] }.
-- Jobs are placed in their original order, so earlier jobs keep their times
-- first; each placement sees the ones before it.
-- -----------------------------------------------------------------------------

create function private.rain_dependent(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    -- A job with no line items, or any item whose service is weather-dependent
    -- (or since deleted), counts.
    select not exists (select 1 from public.booking_items i where i.booking_id = p_booking_id)
        or exists (
            select 1 from public.booking_items i
            left join public.services s on s.id = i.service_id
            where i.booking_id = p_booking_id and coalesce(s.weather_dependent, true)
        );
$$;

create function public.plan_rain_delay(
    p_business_id uuid,
    p_from date,
    p_to date,
    p_skip uuid[] default '{}',
    p_apply boolean default false,
    p_forecast jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    b public.businesses%rowtype;
    v_today date;
    v_delay uuid;
    v_job record;
    v_minutes integer;
    v_target timestamptz;
    v_start timestamptz;
    v_member uuid;
    v_moves jsonb := '[]'::jsonb;
    v_unplaced jsonb := '[]'::jsonb;
    v_row public.bookings%rowtype;
begin
    if p_business_id is null or p_business_id not in (select private.managed_business_ids()) then
        raise exception 'not_allowed' using errcode = '42501';
    end if;

    -- One rain plan at a time per business, like bookings.
    select * into b from public.businesses where id = p_business_id for update;
    v_today := (now() at time zone b.timezone)::date;
    if p_from is null or p_to is null or p_to = p_from or p_from < v_today or p_to < v_today
       or p_to > v_today + b.booking_window_days then
        raise exception 'invalid_days' using errcode = '22023';
    end if;
    if p_forecast is not null and jsonb_typeof(p_forecast) <> 'object' then
        raise exception 'invalid_forecast' using errcode = '22023';
    end if;

    begin
        if p_apply then
            insert into public.rain_delays (business_id, rain_date, moved_to, forecast)
            values (b.id, p_from, p_to, p_forecast)
            returning id into v_delay;
        end if;

        for v_job in
            select bk.id, bk.scheduled_start, bk.scheduled_end, bk.assigned_member_id
            from public.bookings bk
            where bk.business_id = b.id
              and bk.status in ('requested', 'confirmed')
              and (bk.scheduled_start at time zone b.timezone)::date = p_from
              and not (bk.id = any(coalesce(p_skip, '{}')))
              and private.rain_dependent(bk.id)
            order by bk.scheduled_start, bk.id
        loop
            v_minutes := greatest(5, round(extract(epoch from v_job.scheduled_end - v_job.scheduled_start) / 60)::integer);
            -- The same time of day on the new day.
            v_target := (p_to + (v_job.scheduled_start at time zone b.timezone)::time) at time zone b.timezone;
            v_start := null;
            v_member := null;

            -- Their own crew member first, closest to the same time.
            if v_job.assigned_member_id is not null then
                select s.slot_start into v_start
                from private.available_slots(b.id, v_minutes, p_to, 1, v_job.id) s
                where v_job.assigned_member_id in (
                    select fm from private.free_members(b.id, s.slot_start, s.slot_start + make_interval(mins => v_minutes), v_job.id) fm
                )
                order by abs(extract(epoch from s.slot_start - v_target)), s.slot_start
                limit 1;
                if v_start is not null then
                    v_member := v_job.assigned_member_id;
                end if;
            end if;

            -- Else whoever is free closest to that time (fewest jobs that day first).
            if v_start is null then
                select s.slot_start, fm.id into v_start, v_member
                from private.available_slots(b.id, v_minutes, p_to, 1, v_job.id) s
                cross join lateral (
                    select f.id
                    from private.free_members(b.id, s.slot_start, s.slot_start + make_interval(mins => v_minutes), v_job.id) as f(id)
                    order by (
                        select count(*) from public.bookings x
                        where x.business_id = b.id and x.assigned_member_id = f.id
                          and private.booking_is_active(x.status, x.hold_expires_at)
                          and (x.scheduled_start at time zone b.timezone)::date = p_to
                    ), f.id
                    limit 1
                ) fm
                order by abs(extract(epoch from s.slot_start - v_target)), s.slot_start
                limit 1;
            end if;

            if v_start is null then
                v_unplaced := v_unplaced || to_jsonb(v_job.id);
                continue;
            end if;

            update public.bookings
            set scheduled_start = v_start,
                scheduled_end = v_start + make_interval(mins => v_minutes),
                assigned_member_id = v_member,
                rain_delay_id = coalesce(v_delay, rain_delay_id)
            where id = v_job.id
            returning * into v_row;

            v_moves := v_moves || jsonb_build_object(
                'booking_id', v_job.id,
                'from_start', v_job.scheduled_start,
                'to_start', v_row.scheduled_start,
                'to_end', v_row.scheduled_end,
                'member_id', v_member,
                'reassigned', v_member is distinct from v_job.assigned_member_id
            );

            if p_apply then
                -- One email about the rain, not the generic "new time" one.
                perform private.cancel_queued_notifications(v_job.id, array['booking.rescheduled']);
                perform private.enqueue_notification(
                    v_row, 'booking.rain_delay',
                    (select email from public.customers where id = v_row.customer_id),
                    true, now(),
                    jsonb_build_object('previous_start', v_job.scheduled_start, 'rain_date', p_from)
                );
            end if;
        end loop;

        if p_apply then
            update public.rain_delays
            set moved_count = jsonb_array_length(v_moves), left_count = jsonb_array_length(v_unplaced)
            where id = v_delay;
        else
            -- A preview: undo every move (variables keep what was worked out).
            raise exception 'rain_preview' using errcode = 'RNPRV';
        end if;
    exception when sqlstate 'RNPRV' then
        null;
    end;

    return jsonb_build_object('rain_delay_id', v_delay, 'moves', v_moves, 'unplaced', v_unplaced);
end;
$$;

revoke all on function public.plan_rain_delay(uuid, date, date, uuid[], boolean, jsonb) from public, anon;
grant execute on function public.plan_rain_delay(uuid, date, date, uuid[], boolean, jsonb) to authenticated, service_role;
revoke all on function private.rain_dependent(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- save_property_notes: the crew-facing notes on an address. Anyone on the
-- team may edit them (the address itself stays owner/admin only).
-- -----------------------------------------------------------------------------

create function public.save_property_notes(
    p_address_id uuid,
    p_gate_code text,
    p_pets text,
    p_access_notes text,
    p_property_map jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if char_length(coalesce(p_gate_code, '')) > 40 or char_length(coalesce(p_pets, '')) > 200
       or char_length(coalesce(p_access_notes, '')) > 500 then
        raise exception 'notes_too_long' using errcode = '22023';
    end if;
    if p_property_map is not null and (jsonb_typeof(p_property_map) <> 'object' or pg_column_size(p_property_map) > 32768) then
        raise exception 'invalid_property_map' using errcode = '22023';
    end if;

    update public.customer_addresses
    set gate_code = nullif(trim(p_gate_code), ''),
        pets = nullif(trim(p_pets), ''),
        access_notes = nullif(trim(p_access_notes), ''),
        property_map = p_property_map
    where id = p_address_id and business_id in (select private.member_business_ids());
    if not found then
        raise exception 'address_not_found' using errcode = 'P0002';
    end if;
end;
$$;

revoke all on function public.save_property_notes(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.save_property_notes(uuid, text, text, text, jsonb) to authenticated, service_role;
