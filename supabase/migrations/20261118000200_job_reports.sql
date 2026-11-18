-- =============================================================================
-- Job reports: after a job, the customer gets a page with the crew's before
-- and after photos, a note from the crew and when they were there, then a
-- way to tip and to leave a Google review.
--
--   booking_attachments.phase   'before' | 'after' (null for other files)
--   bookings.report_note        the crew's note to the customer
--   businesses.google_review_url where "Leave a review" goes
--   businesses.tips_enabled     offer a tip on the report
--
-- Tips are payments of kind 'tip'. bookings.tip_cents now follows the tips
-- actually paid (less refunds), so a tip adds to the total and the paid
-- amount alike and never shows up as a balance. (refresh_booking_payments
-- body from 20261023000400_payments.sql.)
--
-- When a job is marked completed, 'booking.job_report' is queued for 20
-- minutes later, leaving the crew time to add their after photos.
-- =============================================================================

alter table public.booking_attachments
    add column phase text check (phase in ('before', 'after'));

comment on column public.booking_attachments.phase is 'Before or after photo for the customer''s job report; null for anything else.';

grant insert (phase) on public.booking_attachments to authenticated;
grant update (phase, caption) on public.booking_attachments to authenticated;

create policy "Uploaders and managers update attachments"
    on public.booking_attachments for update to authenticated
    using (
        business_id in (select private.managed_business_ids())
        or (uploaded_by = (select auth.uid()) and business_id in (select private.member_business_ids()))
    )
    with check (business_id in (select private.member_business_ids()));

alter table public.bookings
    add column report_note text check (char_length(report_note) <= 1000);

comment on column public.bookings.report_note is 'The crew''s note to the customer, shown on the job report.';

alter table public.businesses
    add column google_review_url text check (google_review_url ~* '^https://[^\s]+$' and char_length(google_review_url) <= 300),
    add column tips_enabled boolean not null default true;

comment on column public.businesses.google_review_url is 'Where the job report''s "Leave a review" button goes.';
comment on column public.businesses.tips_enabled is 'Offer customers a tip on their job report.';

grant insert (google_review_url, tips_enabled), update (google_review_url, tips_enabled) on public.businesses to authenticated;

-- Tips come from payments now; nobody types them in.
revoke update (tip_cents) on public.bookings from authenticated;
revoke insert (tip_cents) on public.bookings from authenticated;

-- -----------------------------------------------------------------------------
-- The crew's note. Anyone on the team can write it (crew can't update
-- bookings directly), so it goes through a function that checks membership.
-- -----------------------------------------------------------------------------

create function public.save_job_report_note(p_booking_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if char_length(coalesce(p_note, '')) > 1000 then
        raise exception 'note_too_long' using errcode = '22023';
    end if;
    update public.bookings
    set report_note = nullif(trim(p_note), '')
    where id = p_booking_id and business_id in (select private.member_business_ids());
    if not found then
        raise exception 'booking_not_found' using errcode = 'P0002';
    end if;
end;
$$;

revoke all on function public.save_job_report_note(uuid, text) from public, anon;
grant execute on function public.save_job_report_note(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Payment totals -> booking, now with tips.
-- -----------------------------------------------------------------------------

create or replace function private.refresh_booking_payments()
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
    v_tips integer;
    v_booking public.bookings%rowtype;
begin
    select
        coalesce(sum(amount_cents), 0),
        coalesce(sum(amount_refunded_cents), 0),
        coalesce(sum(amount_cents - amount_refunded_cents) filter (where kind = 'deposit'), 0),
        coalesce(sum(amount_cents - amount_refunded_cents) filter (where kind = 'tip'), 0)
    into v_paid, v_refunded, v_deposit_paid, v_tips
    from public.payments
    where booking_id = v_booking_id and status in ('succeeded', 'partially_refunded', 'refunded');

    update public.bookings
    set amount_paid_cents = v_paid,
        amount_refunded_cents = v_refunded,
        deposit_paid_cents = v_deposit_paid,
        tip_cents = v_tips
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

-- -----------------------------------------------------------------------------
-- "Your job report is ready", a little after the job is marked done.
-- -----------------------------------------------------------------------------

create function private.queue_job_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.status = 'completed' and old.status is distinct from 'completed' then
        perform private.enqueue_notification(
            new, 'booking.job_report',
            (select email from public.customers where id = new.customer_id),
            true, now() + interval '20 minutes'
        );
    end if;
    return null;
end;
$$;

revoke all on function private.queue_job_report() from public, anon, authenticated;

create trigger bookings_queue_job_report
    after update of status on public.bookings
    for each row execute function private.queue_job_report();
