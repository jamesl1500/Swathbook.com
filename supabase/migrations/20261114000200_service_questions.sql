-- =============================================================================
-- Questions on services: the owner asks things like "Make and model?" on a
-- service, and customers answer them when they book it.
--
--   service_questions  The owner's questions (free text, or pick one of a few
--                      options), required or optional. Edited through
--                      save_service_questions(), which runs as the caller, so
--                      RLS decides who may change them.
--   booking_answers    What the customer said, with the question and service
--                      name copied in: editing or deleting a question later
--                      never rewrites a past job.
--
-- create_booking takes the answers (p_answers) and checks them: every answer
-- belongs to a question on a booked service, choices are one of the options,
-- and bookings from the public page answer every required question.
-- (create_booking body from 20261026000100_billing.sql; get_booking_page from
-- 20261028000200_service_area.sql; customer_booking_json from
-- 20261110000100_customer_app.sql.)
-- =============================================================================

create type public.question_kind as enum ('text', 'choice');

create table public.service_questions (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null,
    service_id uuid not null,
    prompt text not null check (char_length(prompt) between 2 and 200),
    kind public.question_kind not null default 'text',
    -- The choices for a 'choice' question (2 to 20); empty for free text.
    options text[] not null default '{}',
    is_required boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (business_id, service_id) references public.services (business_id, id) on delete cascade,
    constraint service_questions_options check (
        (kind = 'text' and cardinality(options) = 0)
        or (kind = 'choice' and cardinality(options) between 2 and 20)
    )
);

comment on table public.service_questions is 'Questions a customer answers when booking a service, e.g. "Make and model?".';

create index service_questions_service_idx on public.service_questions (service_id, sort_order);
create index service_questions_business_idx on public.service_questions (business_id);

create trigger service_questions_set_updated_at
    before update on public.service_questions
    for each row execute function private.set_updated_at();

create table public.booking_answers (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null,
    booking_id uuid not null,
    -- Kept for reporting; null once the owner deletes the question.
    question_id uuid references public.service_questions (id) on delete set null,
    -- Copies at booking time, so the job always reads as the customer saw it.
    service_name text not null,
    prompt text not null,
    answer text not null check (char_length(answer) between 1 and 1000),
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    foreign key (business_id, booking_id) references public.bookings (business_id, id) on delete cascade
);

comment on table public.booking_answers is 'A customer''s answers to service questions for one booking. Written only by create_booking.';

create index booking_answers_booking_idx on public.booking_answers (booking_id, sort_order);
create index booking_answers_business_idx on public.booking_answers (business_id);
create index booking_answers_question_idx on public.booking_answers (question_id) where question_id is not null;

-- -----------------------------------------------------------------------------
-- Access: the whole team reads (crew need to know it's an SUV); owners and
-- admins change questions; answers are written only by create_booking.
-- -----------------------------------------------------------------------------

alter table public.service_questions enable row level security;
alter table public.booking_answers enable row level security;

create policy "Members read service questions"
    on public.service_questions for select to authenticated
    using (business_id in (select private.member_business_ids()));
create policy "Owners and admins insert service questions"
    on public.service_questions for insert to authenticated
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins update service questions"
    on public.service_questions for update to authenticated
    using (business_id in (select private.managed_business_ids()))
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins delete service questions"
    on public.service_questions for delete to authenticated
    using (business_id in (select private.managed_business_ids()));

create policy "Members read booking answers"
    on public.booking_answers for select to authenticated
    using (business_id in (select private.member_business_ids()));

revoke all on public.service_questions, public.booking_answers from anon, authenticated;
grant select, delete on public.service_questions to authenticated;
grant insert (business_id, service_id, prompt, kind, options, is_required, sort_order) on public.service_questions to authenticated;
grant update (prompt, kind, options, is_required, sort_order) on public.service_questions to authenticated;
grant select on public.booking_answers to authenticated;

-- -----------------------------------------------------------------------------
-- save_service_questions: replace a service's questions in one go.
--   p_questions: [{ id?, prompt, kind: 'text'|'choice', options?: [..], required? }]
-- Questions keep their id when it's passed back, so past answers stay linked;
-- ones left out are deleted. Runs as the caller: RLS limits it to owners and
-- admins of the service's business.
-- -----------------------------------------------------------------------------

create function public.save_service_questions(p_service_id uuid, p_questions jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_business uuid;
    v_question jsonb;
    v_id uuid;
    v_prompt text;
    v_kind public.question_kind;
    v_options text[];
    v_required boolean;
    v_kept uuid[] := '{}';
    v_position integer := 0;
begin
    select s.business_id into v_business
    from public.services s
    where s.id = p_service_id and s.business_id in (select private.managed_business_ids());
    if v_business is null then
        raise exception 'service_not_found' using errcode = 'P0002';
    end if;

    if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
        raise exception 'invalid_questions' using errcode = '22023';
    end if;
    if jsonb_array_length(p_questions) > 10 then
        raise exception 'too_many_questions' using errcode = '22023';
    end if;

    for v_question in select value from jsonb_array_elements(p_questions) loop
        if jsonb_typeof(v_question) <> 'object' then
            raise exception 'invalid_questions' using errcode = '22023';
        end if;

        v_prompt := trim(coalesce(v_question ->> 'prompt', ''));
        if char_length(v_prompt) not between 2 and 200 then
            raise exception 'invalid_question_prompt' using errcode = '22023';
        end if;

        v_kind := case v_question ->> 'kind' when 'text' then 'text' when 'choice' then 'choice' end;
        if v_kind is null then
            raise exception 'invalid_questions' using errcode = '22023';
        end if;

        -- Options in the order given, trimmed, without blanks or repeats ("SUV"
        -- and "suv" are the same option; the first spelling wins).
        if v_kind = 'choice' then
            if jsonb_typeof(coalesce(v_question -> 'options', '[]')) <> 'array' then
                raise exception 'invalid_question_options' using errcode = '22023';
            end if;
            select coalesce(array_agg(option order by first_position), '{}') into v_options
            from (
                select distinct on (lower(trim(o.value))) trim(o.value) as option, o.ordinality as first_position
                from jsonb_array_elements_text(coalesce(v_question -> 'options', '[]')) with ordinality as o(value, ordinality)
                where trim(o.value) <> ''
                order by lower(trim(o.value)), o.ordinality
            ) opts;
            if cardinality(v_options) not between 2 and 20
               or exists (select 1 from unnest(v_options) as o where char_length(o) > 80) then
                raise exception 'invalid_question_options' using errcode = '22023';
            end if;
        else
            v_options := '{}';
        end if;

        v_required := coalesce(v_question ->> 'required', 'true') = 'true';

        v_id := null;
        if (v_question ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            update public.service_questions q
            set prompt = v_prompt, kind = v_kind, options = v_options, is_required = v_required, sort_order = v_position
            where q.id = (v_question ->> 'id')::uuid and q.service_id = p_service_id
            returning q.id into v_id;
        end if;
        -- New, or an id that isn't one of this service's questions.
        if v_id is null then
            insert into public.service_questions (business_id, service_id, prompt, kind, options, is_required, sort_order)
            values (v_business, p_service_id, v_prompt, v_kind, v_options, v_required, v_position)
            returning id into v_id;
        end if;

        v_kept := v_kept || v_id;
        v_position := v_position + 1;
    end loop;

    delete from public.service_questions q
    where q.service_id = p_service_id and not (q.id = any(v_kept));
end;
$$;

revoke all on function public.save_service_questions(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_service_questions(uuid, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- get_booking_page: each service now lists its questions.
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
                'deposit_cents', case when coalesce(sca.charges_enabled, false) then private.service_deposit_cents(s) else 0 end,
                'questions', coalesce((
                    select jsonb_agg(jsonb_build_object(
                        'id', q.id,
                        'prompt', q.prompt,
                        'kind', q.kind,
                        'options', to_jsonb(q.options),
                        'required', q.is_required
                    ) order by q.sort_order, q.created_at)
                    from public.service_questions q
                    where q.business_id = b.id and q.service_id = s.id
                ), '[]'::jsonb)
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

-- -----------------------------------------------------------------------------
-- create_booking: now takes the customer's answers.
--   p_answers: [{ question_id, answer }]
-- -----------------------------------------------------------------------------

drop function public.create_booking(uuid, uuid[], timestamptz, jsonb, jsonb, text, public.booking_source);

create function public.create_booking(
    p_business_id uuid,
    p_service_ids uuid[],
    p_start timestamptz,
    p_customer jsonb,
    p_address jsonb,
    p_customer_notes text default null,
    p_source public.booking_source default 'booking_page',
    p_answers jsonb default null
)
returns table (
    booking_id uuid,
    reference text,
    public_token text,
    status public.booking_status,
    total_cents integer,
    deposit_due_cents integer,
    hold_expires_at timestamptz,
    stripe_account_id text,
    customer_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    b public.businesses%rowtype;
    v_stripe_account text;
    v_duration integer;
    v_deposit integer;
    v_matched integer;
    v_end timestamptz;
    v_member uuid;
    v_email text;
    v_customer uuid;
    v_address uuid;
    v_lat double precision := (p_address ->> 'lat')::double precision;
    v_lng double precision := (p_address ->> 'lng')::double precision;
    v_booking public.bookings%rowtype;
    v_answers jsonb := coalesce(p_answers, '[]'::jsonb);
begin
    -- Lock the business row: bookings for one business are created one at a
    -- time, so two customers can never both win the last slot.
    select * into b from public.businesses
    where id = p_business_id and is_published and private.business_has_access(id)
    for update;
    if not found then
        raise exception 'business_not_found' using errcode = 'P0002';
    end if;

    if coalesce(cardinality(p_service_ids), 0) = 0 or cardinality(p_service_ids) > 10
       or cardinality(p_service_ids) <> (select count(distinct x) from unnest(p_service_ids) as x) then
        raise exception 'invalid_services' using errcode = '22023';
    end if;

    select sca.stripe_account_id into v_stripe_account
    from public.stripe_connect_accounts sca
    where sca.business_id = b.id and sca.charges_enabled;

    select sum(s.duration_minutes), sum(private.service_deposit_cents(s)), count(*)
    into v_duration, v_deposit, v_matched
    from public.services s
    where s.business_id = b.id and s.id = any(p_service_ids) and s.is_active
      and (s.is_public or p_source <> 'booking_page');

    if v_matched <> cardinality(p_service_ids) then
        raise exception 'invalid_services' using errcode = '22023';
    end if;

    -- Answers: each to a different question on a booked service, not too long,
    -- and one of the options for a choice question.
    if jsonb_typeof(v_answers) <> 'array' or jsonb_array_length(v_answers) > 100
       or exists (select 1 from jsonb_array_elements(v_answers) a where jsonb_typeof(a) <> 'object')
    then
        raise exception 'invalid_answers' using errcode = '22023';
    end if;
    if exists (
        select 1
        from jsonb_array_elements(v_answers) a
        left join public.service_questions q
            on q.id::text = lower(a ->> 'question_id') and q.business_id = b.id and q.service_id = any(p_service_ids)
        where q.id is null
           or char_length(trim(coalesce(a ->> 'answer', ''))) > 1000
           or (q.kind = 'choice' and trim(coalesce(a ->> 'answer', '')) <> '' and not (trim(a ->> 'answer') = any(q.options)))
    ) or (select count(distinct lower(a ->> 'question_id')) from jsonb_array_elements(v_answers) a) <> jsonb_array_length(v_answers)
    then
        raise exception 'invalid_answers' using errcode = '22023';
    end if;
    -- Customers booking themselves answer every required question.
    if p_source = 'booking_page' and exists (
        select 1 from public.service_questions q
        where q.business_id = b.id and q.service_id = any(p_service_ids) and q.is_required
          and not exists (
              select 1 from jsonb_array_elements(v_answers) a
              where lower(a ->> 'question_id') = q.id::text and trim(coalesce(a ->> 'answer', '')) <> ''
          )
    ) then
        raise exception 'answers_required' using errcode = '22023';
    end if;

    -- No payout account yet: the booking goes through without online payment.
    if v_stripe_account is null then
        v_deposit := 0;
    end if;

    -- Cheapest check first, and the most useful answer for someone too far away.
    if v_lat is not null and v_lng is not null and b.base_lat is not null and b.service_radius_miles is not null
       and private.distance_miles(b.base_lat, b.base_lng, v_lat, v_lng) > b.service_radius_miles then
        raise exception 'outside_service_area' using errcode = 'P0001';
    end if;

    -- Free up slots held by customers who never paid.
    update public.bookings bk
    set status = 'cancelled', cancellation_reason = 'Payment hold expired'
    where bk.business_id = b.id and bk.status = 'pending_payment' and bk.hold_expires_at <= now();

    v_end := p_start + make_interval(mins => v_duration);

    if not exists (
        select 1 from private.available_slots(b.id, v_duration, (p_start at time zone b.timezone)::date, 1) s
        where s.slot_start = p_start
    ) then
        raise exception 'slot_unavailable' using errcode = 'P0001';
    end if;

    -- Spread work: the free member with the fewest jobs that day.
    select fm.id into v_member
    from private.free_members(b.id, p_start, v_end) as fm(id)
    order by (
        select count(*) from public.bookings bk
        where bk.business_id = b.id and bk.assigned_member_id = fm.id
          and private.booking_is_active(bk.status, bk.hold_expires_at)
          and (bk.scheduled_start at time zone b.timezone)::date = (p_start at time zone b.timezone)::date
    ), fm.id
    limit 1;

    if v_member is null then
        raise exception 'slot_unavailable' using errcode = 'P0001';
    end if;

    -- Customer (deduplicated by email within the business)
    v_email := lower(nullif(trim(p_customer ->> 'email'), ''));
    if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'invalid_email' using errcode = '22023';
    end if;

    insert into public.customers as c (business_id, full_name, email, phone)
    values (b.id, left(trim(p_customer ->> 'full_name'), 120), v_email, nullif(trim(p_customer ->> 'phone'), ''))
    on conflict (business_id, email) where email is not null
    do update set full_name = excluded.full_name, phone = coalesce(excluded.phone, c.phone)
    returning c.id into v_customer;

    -- Address (reuse an identical one)
    select a.id into v_address
    from public.customer_addresses a
    where a.business_id = b.id and a.customer_id = v_customer
      and lower(a.line1) = lower(trim(p_address ->> 'line1'))
      and coalesce(a.postal_code, '') = coalesce(trim(p_address ->> 'postal_code'), '')
    limit 1;

    if v_address is null then
        insert into public.customer_addresses (
            business_id, customer_id, line1, line2, city, region, postal_code, country, lat, lng, access_notes, is_primary
        )
        values (
            b.id, v_customer,
            trim(p_address ->> 'line1'),
            nullif(trim(p_address ->> 'line2'), ''),
            nullif(trim(p_address ->> 'city'), ''),
            nullif(trim(p_address ->> 'region'), ''),
            nullif(trim(p_address ->> 'postal_code'), ''),
            coalesce(upper(nullif(trim(p_address ->> 'country'), '')), 'US'),
            v_lat, v_lng,
            left(nullif(trim(p_address ->> 'access_notes'), ''), 500),
            not exists (select 1 from public.customer_addresses a where a.customer_id = v_customer and a.is_primary)
        )
        returning id into v_address;
    end if;

    insert into public.bookings (
        business_id, customer_id, address_id, assigned_member_id, status, source,
        scheduled_start, scheduled_end, hold_expires_at, currency, deposit_due_cents, customer_notes, created_by
    )
    values (
        b.id, v_customer, v_address, v_member,
        case when v_deposit > 0 then 'pending_payment'
             when b.auto_confirm then 'confirmed'
             else 'requested' end::public.booking_status,
        p_source, p_start, v_end,
        case when v_deposit > 0 then now() + interval '30 minutes' end,
        b.currency, v_deposit, left(p_customer_notes, 2000), null
    )
    returning * into v_booking;

    insert into public.booking_items (business_id, booking_id, service_id, name, description, unit_price_cents, duration_minutes, sort_order)
    select b.id, v_booking.id, s.id, s.name, s.description, s.price_cents, s.duration_minutes,
           array_position(p_service_ids, s.id)
    from public.services s
    where s.business_id = b.id and s.id = any(p_service_ids);

    -- Answers in the order the customer saw them: by service, then question.
    insert into public.booking_answers (business_id, booking_id, question_id, service_name, prompt, answer, sort_order)
    select b.id, v_booking.id, q.id, s.name, q.prompt, trim(a ->> 'answer'),
           row_number() over (order by array_position(p_service_ids, q.service_id), q.sort_order, q.created_at)
    from jsonb_array_elements(v_answers) a
    join public.service_questions q on q.id::text = lower(a ->> 'question_id') and q.business_id = b.id
    join public.services s on s.business_id = b.id and s.id = q.service_id
    where trim(coalesce(a ->> 'answer', '')) <> '';

    select * into v_booking from public.bookings where id = v_booking.id;

    return query select
        v_booking.id, v_booking.reference, v_booking.public_token, v_booking.status,
        v_booking.total_cents, v_booking.deposit_due_cents, v_booking.hold_expires_at,
        v_stripe_account, v_customer;
end;
$$;

revoke all on function public.create_booking(uuid, uuid[], timestamptz, jsonb, jsonb, text, public.booking_source, jsonb)
from public, anon, authenticated;
grant execute on function public.create_booking(uuid, uuid[], timestamptz, jsonb, jsonb, text, public.booking_source, jsonb)
to service_role;

-- -----------------------------------------------------------------------------
-- customer_booking_json (the customer app's view of a booking): adds answers.
-- -----------------------------------------------------------------------------

create or replace function private.customer_booking_json(bk public.bookings)
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
        'answers', coalesce((
            select jsonb_agg(jsonb_build_object('service_name', ans.service_name, 'prompt', ans.prompt, 'answer', ans.answer)
                             order by ans.sort_order)
            from public.booking_answers ans
            where ans.business_id = bk.business_id and ans.booking_id = bk.id
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
