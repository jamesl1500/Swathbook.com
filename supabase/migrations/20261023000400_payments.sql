-- =============================================================================
-- Swathbook schema · 4/6 · Payments (Stripe)
--
-- Money model
--   * Customer payments (deposits, balances, tips) are charged on each
--     business's Stripe Connect account. Swathbook can take an application fee.
--   * Swathbook's own subscription billing uses the platform Stripe account
--     (businesses.stripe_customer_id + subscriptions).
--   * Stripe is the source of truth. The server's webhook handler (service
--     role) upserts payments/refunds; triggers roll totals up into bookings and
--     invoices. Clients can read money tables but never write them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Connected accounts (one per business)
-- -----------------------------------------------------------------------------

create table public.stripe_connect_accounts (
    business_id uuid primary key references public.businesses (id) on delete cascade,
    stripe_account_id text not null unique check (stripe_account_id ~ '^acct_'),
    account_type text not null default 'express' check (account_type in ('express', 'standard', 'custom')),
    country text check (country ~ '^[A-Z]{2}$'),
    default_currency text check (default_currency ~ '^[a-z]{3}$'),
    charges_enabled boolean not null default false,
    payouts_enabled boolean not null default false,
    details_submitted boolean not null default false,
    -- Mirrors account.requirements.currently_due, for "finish setting up payouts" prompts.
    requirements_due text[] not null default '{}',
    disabled_reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.stripe_connect_accounts is 'The business''s Stripe Connect account. Updated from account.updated webhooks.';

create trigger stripe_connect_accounts_set_updated_at
    before update on public.stripe_connect_accounts
    for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Swathbook subscriptions (platform billing)
-- -----------------------------------------------------------------------------

create table public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    stripe_subscription_id text not null unique check (stripe_subscription_id ~ '^sub_'),
    stripe_customer_id text not null check (stripe_customer_id ~ '^cus_'),
    stripe_price_id text check (stripe_price_id ~ '^price_'),
    plan public.subscription_plan not null,
    status public.subscription_status not null,
    seats integer not null default 1 check (seats between 1 and 1000),
    current_period_start timestamptz,
    current_period_end timestamptz,
    trial_end timestamptz,
    cancel_at_period_end boolean not null default false,
    canceled_at timestamptz,
    ended_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- At most one live subscription per business.
create unique index subscriptions_one_live_per_business
    on public.subscriptions (business_id)
    where status not in ('canceled', 'incomplete_expired');
create index subscriptions_business_idx on public.subscriptions (business_id, created_at desc);

create trigger subscriptions_set_updated_at
    before update on public.subscriptions
    for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Invoices (one per booking; amounts come from the booking)
-- -----------------------------------------------------------------------------

create table public.invoices (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    booking_id uuid not null,
    customer_id uuid not null,
    number integer not null,
    status public.invoice_status not null default 'draft',
    issued_at timestamptz,
    due_date date,
    paid_at timestamptz,
    voided_at timestamptz,
    memo text check (char_length(memo) <= 1000),
    -- Unguessable link for the customer's hosted invoice / pay page.
    public_token text not null unique default private.random_token(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (business_id, number),
    unique (business_id, booking_id),
    unique (business_id, id),
    foreign key (business_id, booking_id) references public.bookings (business_id, id) on delete restrict,
    foreign key (business_id, customer_id) references public.customers (business_id, id) on delete restrict
);

create index invoices_customer_idx on public.invoices (business_id, customer_id);
create index invoices_open_idx on public.invoices (business_id, due_date) where status = 'open';

create trigger invoices_set_updated_at
    before update on public.invoices
    for each row execute function private.set_updated_at();

-- Sequential, gap-tolerant invoice numbers per business. The row lock on the
-- business makes concurrent inserts safe.
create function private.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.businesses
    set next_invoice_number = next_invoice_number + 1
    where id = new.business_id
    returning next_invoice_number - 1 into new.number;
    return new;
end;
$$;

create trigger invoices_assign_number
    before insert on public.invoices
    for each row execute function private.assign_invoice_number();

create function private.stamp_invoice_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' or new.status is distinct from old.status then
        case new.status
            when 'open' then new.issued_at := coalesce(new.issued_at, now());
            when 'paid' then new.paid_at := coalesce(new.paid_at, now());
            when 'void' then new.voided_at := coalesce(new.voided_at, now());
            else null;
        end case;
    end if;
    return new;
end;
$$;

create trigger invoices_stamp_status
    before insert or update of status on public.invoices
    for each row execute function private.stamp_invoice_status();

-- -----------------------------------------------------------------------------
-- Payments (Stripe PaymentIntents on the connected account)
-- -----------------------------------------------------------------------------

create table public.payments (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    booking_id uuid not null,
    customer_id uuid not null,
    kind public.payment_kind not null,
    status public.payment_status not null default 'requires_payment',
    currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
    amount_cents integer not null check (amount_cents > 0),
    amount_refunded_cents integer not null default 0 check (amount_refunded_cents >= 0),
    application_fee_cents integer not null default 0 check (application_fee_cents >= 0),
    stripe_fee_cents integer check (stripe_fee_cents >= 0),
    net_cents integer,

    stripe_account_id text not null check (stripe_account_id ~ '^acct_'),
    stripe_payment_intent_id text unique check (stripe_payment_intent_id ~ '^pi_'),
    stripe_checkout_session_id text unique check (stripe_checkout_session_id ~ '^cs_'),
    stripe_charge_id text unique check (stripe_charge_id ~ '^(ch|py)_'),

    payment_method_type text check (char_length(payment_method_type) <= 40),
    card_brand text check (char_length(card_brand) <= 20),
    card_last4 text check (card_last4 ~ '^[0-9]{4}$'),
    failure_code text,
    failure_message text check (char_length(failure_message) <= 500),
    succeeded_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (business_id, id),
    check (amount_refunded_cents <= amount_cents),
    check (application_fee_cents <= amount_cents),
    check (stripe_payment_intent_id is not null or stripe_checkout_session_id is not null),
    -- Payment history must outlive mistakes elsewhere: bookings/customers with payments can't be deleted.
    foreign key (business_id, booking_id) references public.bookings (business_id, id) on delete restrict,
    foreign key (business_id, customer_id) references public.customers (business_id, id) on delete restrict
);

comment on table public.payments is 'One row per Stripe PaymentIntent. Written by the webhook handler (service role) only.';

create index payments_booking_idx on public.payments (business_id, booking_id);
create index payments_customer_idx on public.payments (business_id, customer_id);
create index payments_business_created_idx on public.payments (business_id, created_at desc);

create trigger payments_set_updated_at
    before update on public.payments
    for each row execute function private.set_updated_at();

create function private.stamp_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.status = 'succeeded' and (tg_op = 'INSERT' or old.status is distinct from 'succeeded') then
        new.succeeded_at := coalesce(new.succeeded_at, now());
    end if;
    return new;
end;
$$;

create trigger payments_stamp
    before insert or update of status on public.payments
    for each row execute function private.stamp_payment();

-- -----------------------------------------------------------------------------
-- Refunds
-- -----------------------------------------------------------------------------

create table public.refunds (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    payment_id uuid not null,
    amount_cents integer not null check (amount_cents > 0),
    status public.refund_status not null default 'pending',
    reason text not null default 'requested_by_customer'
        check (reason in ('requested_by_customer', 'duplicate', 'fraudulent', 'cancellation', 'other')),
    note text check (char_length(note) <= 500),
    stripe_refund_id text unique check (stripe_refund_id ~ '^re_'),
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (business_id, payment_id) references public.payments (business_id, id) on delete restrict
);

create index refunds_payment_idx on public.refunds (business_id, payment_id);
create index refunds_created_by_idx on public.refunds (created_by);

create trigger refunds_set_updated_at
    before update on public.refunds
    for each row execute function private.set_updated_at();

-- Refund totals -> payment.
create function private.refresh_payment_refunds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_payment_id uuid := coalesce(new.payment_id, old.payment_id);
    v_refunded integer;
begin
    select coalesce(sum(amount_cents), 0) into v_refunded
    from public.refunds
    where payment_id = v_payment_id and status = 'succeeded';

    update public.payments p
    set amount_refunded_cents = v_refunded,
        status = case
            when p.status not in ('succeeded', 'refunded', 'partially_refunded') then p.status
            when v_refunded = 0 then 'succeeded'
            when v_refunded >= p.amount_cents then 'refunded'
            else 'partially_refunded'
        end
    where p.id = v_payment_id;
    return null;
end;
$$;

create trigger refunds_refresh_payment
    after insert or update of amount_cents, status or delete on public.refunds
    for each row execute function private.refresh_payment_refunds();

-- Payment totals -> booking (and invoice). Confirms a booking that was holding
-- its slot as soon as the deposit lands.
create function private.refresh_booking_payments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_booking_id uuid := coalesce(new.booking_id, old.booking_id);
    v_paid integer;
    v_refunded integer;
    v_deposit_paid integer;
    v_booking public.bookings%rowtype;
begin
    select
        coalesce(sum(amount_cents), 0),
        coalesce(sum(amount_refunded_cents), 0),
        coalesce(sum(amount_cents - amount_refunded_cents) filter (where kind = 'deposit'), 0)
    into v_paid, v_refunded, v_deposit_paid
    from public.payments
    where booking_id = v_booking_id and status in ('succeeded', 'partially_refunded', 'refunded');

    update public.bookings
    set amount_paid_cents = v_paid,
        amount_refunded_cents = v_refunded,
        deposit_paid_cents = v_deposit_paid
    where id = v_booking_id
    returning * into v_booking;

    if v_booking.status = 'pending_payment' and v_deposit_paid >= v_booking.deposit_due_cents then
        update public.bookings b
        set status = case
            when (select auto_confirm from public.businesses where id = b.business_id) then 'confirmed'::public.booking_status
            else 'requested'::public.booking_status
        end
        where b.id = v_booking_id;
    end if;

    if tg_op <> 'DELETE' and new.status = 'succeeded' and (tg_op = 'INSERT' or old.status is distinct from 'succeeded') then
        insert into public.booking_events (business_id, booking_id, event_type, data)
        values (new.business_id, new.booking_id, 'payment', jsonb_build_object(
            'payment_id', new.id, 'kind', new.kind, 'amount_cents', new.amount_cents));
    end if;

    if v_booking.total_cents > 0 and v_booking.balance_due_cents <= 0 then
        update public.invoices set status = 'paid'
        where booking_id = v_booking_id and status = 'open';
    end if;

    return null;
end;
$$;

create trigger payments_refresh_booking
    after insert or update of status, amount_cents, amount_refunded_cents, kind or delete on public.payments
    for each row execute function private.refresh_booking_payments();

-- -----------------------------------------------------------------------------
-- Stripe webhook log (idempotency + debugging). Service role only.
-- -----------------------------------------------------------------------------

create table public.stripe_webhook_events (
    id text primary key check (id ~ '^evt_'),
    type text not null,
    stripe_account_id text,
    api_version text,
    livemode boolean not null default false,
    payload jsonb not null,
    received_at timestamptz not null default now(),
    processed_at timestamptz,
    attempts integer not null default 0,
    last_error text
);

comment on table public.stripe_webhook_events is
    'Every Stripe event received. Insert with ON CONFLICT (id) DO NOTHING to process each event exactly once.';

create index stripe_webhook_events_unprocessed_idx on public.stripe_webhook_events (received_at) where processed_at is null;
create index stripe_webhook_events_type_idx on public.stripe_webhook_events (type, received_at desc);

-- -----------------------------------------------------------------------------
-- RLS: money is visible to owners and admins only, and never writable by clients
-- -----------------------------------------------------------------------------

alter table public.stripe_connect_accounts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.stripe_webhook_events enable row level security;
-- (stripe_webhook_events intentionally has no policies.)

create policy "Owners and admins read payout account"
    on public.stripe_connect_accounts for select to authenticated
    using (business_id in (select private.managed_business_ids()));

create policy "Owners and admins read subscriptions"
    on public.subscriptions for select to authenticated
    using (business_id in (select private.managed_business_ids()));

create policy "Owners and admins read invoices"
    on public.invoices for select to authenticated
    using (business_id in (select private.managed_business_ids()));
create policy "Owners and admins create invoices"
    on public.invoices for insert to authenticated
    with check (business_id in (select private.managed_business_ids()));
create policy "Owners and admins update invoices"
    on public.invoices for update to authenticated
    using (business_id in (select private.managed_business_ids()))
    with check (business_id in (select private.managed_business_ids()));

create policy "Owners and admins read payments"
    on public.payments for select to authenticated
    using (business_id in (select private.managed_business_ids()));

create policy "Owners and admins read refunds"
    on public.refunds for select to authenticated
    using (business_id in (select private.managed_business_ids()));
