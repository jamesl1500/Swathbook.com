-- Behavior tests for the Swathbook schema. Run with: pnpm db:test
-- Plays owners, crew, anonymous visitors and the server (service role) against
-- the real policies, grants, triggers and functions. Everything rolls back.
begin;
\set QUIET 1
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------------------------------------------------------------------------
-- Test helpers (run as the caller's role)
-- ---------------------------------------------------------------------------
create schema t;
create function t.ok(p_cond boolean, p_msg text) returns text language sql as $$
    select extensions.ok(coalesce(p_cond, false), p_msg);
$$;
-- Passes when p_sql fails with an error whose message contains p_like (or whose SQLSTATE is p_like).
create function t.expect_error(p_sql text, p_like text, p_msg text) returns text language plpgsql as $$
begin
    begin
        execute p_sql;
    exception when others then
        if sqlerrm ilike '%' || p_like || '%' or sqlstate = p_like then
            return extensions.ok(true, p_msg);
        end if;
        return extensions.ok(false, p_msg) || E'\n' || extensions.diag(format('wrong error [%s] %s', sqlstate, sqlerrm));
    end;
    return extensions.ok(false, p_msg) || E'\n' || extensions.diag('statement succeeded');
end $$;
create function t.as_user(p_id uuid, p_email text) returns void language sql as $$
    select set_config('request.jwt.claims', json_build_object('sub', p_id, 'email', p_email, 'role', 'authenticated')::text, false);
$$;
grant usage on schema t to public;
grant execute on all functions in schema t to public;

-- ---------------------------------------------------------------------------
-- Users: A owns "Green Acres", B owns "Rival Lawn", C is invited as crew to A
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice Owner"}'),
    ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob Rival"}'),
    ('00000000-0000-0000-0000-00000000000c', 'carl@example.com', '{"full_name": "Carl Crew"}');

select t.ok((select count(*) = 3 from public.profiles where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c')), 'signup trigger creates a profile per user');
select t.ok((select full_name = 'Alice Owner' from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'profile picks up full_name from signup metadata');

-- --- Alice sets up her business ------------------------------------------------
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a', 'alice@example.com');

insert into public.businesses (owner_id, name, slug, trade, timezone, base_address, base_lat, base_lng, service_radius_miles,
                               booking_lead_time_minutes, buffer_minutes, is_published, onboarding_completed_at)
values ('00000000-0000-0000-0000-00000000000a', 'Green Acres', 'green-acres', 'lawn-care', 'America/Chicago',
        '1 Main St', 30.2672, -97.7431, 25, 0, 0, true, now())
-- RETURNING, exactly like supabase-js .insert().select(): the owner must be able
-- to read the row back before the membership trigger has run.
returning id as biz_a \gset
select t.ok(:'biz_a' is not null, 'a new owner can insert a business and read it back in the same statement');

select t.ok((select role = 'owner' from public.business_members where business_id = :'biz_a'), 'owner membership created automatically');

insert into public.services (business_id, name, price_cents, duration_minutes, deposit_type, deposit_percent, sort_order)
values (:'biz_a', 'Weekly mow', 4500, 60, 'none', 0, 1),
       (:'biz_a', 'Leaf cleanup', 24000, 120, 'percent', 25, 2);
select id as svc_mow from public.services where name = 'Weekly mow' \gset
select id as svc_leaf from public.services where name = 'Leaf cleanup' \gset

insert into public.business_hours (business_id, weekday, opens_at, closes_at)
select :'biz_a', d, '08:00', '17:00' from generate_series(0, 6) d;

select t.expect_error($$update public.businesses set stripe_customer_id = 'cus_hack' where slug = 'green-acres'$$,
                      'permission denied', 'owners cannot write platform Stripe ids');
select t.expect_error($$update public.businesses set owner_id = '00000000-0000-0000-0000-00000000000b' where slug = 'green-acres'$$,
                      'permission denied', 'ownership cannot be reassigned by clients');
select t.expect_error($$update public.businesses set timezone = 'Mars/Olympus' where slug = 'green-acres'$$,
                      'time zone', 'invalid time zones are rejected');
select t.expect_error($$insert into public.services (business_id, name, price_cents, duration_minutes, deposit_type, deposit_percent)
                        values ('$$ || :'biz_a' || $$', 'Bad deposit', 1000, 30, 'none', 50)$$,
                      'services_deposit_consistent', 'deposit settings must be consistent');

-- --- Alice runs a second business ---------------------------------------------
insert into public.businesses (owner_id, name, slug, trade, is_published)
values ('00000000-0000-0000-0000-00000000000a', 'Green Acres North', 'green-acres-north', 'landscaping', true);
select t.ok((select count(*) = 2 from public.businesses), 'an owner can run several businesses');
select t.ok((select count(*) = 2 from public.business_members where role = 'owner'), 'owner membership exists on each business');
select t.expect_error($$insert into public.businesses (owner_id, name, slug, trade)
                        values ('00000000-0000-0000-0000-00000000000a', 'Dup', 'green-acres', 'x')$$,
                      'businesses_slug_key', 'slugs stay globally unique across one owner''s businesses');
insert into public.businesses (owner_id, name, slug, trade)
select '00000000-0000-0000-0000-00000000000a', 'Extra ' || n, 'extra-' || n, 'lawn-care' from generate_series(3, 25) n;
select t.expect_error($$insert into public.businesses (owner_id, name, slug, trade)
                        values ('00000000-0000-0000-0000-00000000000a', 'One too many', 'extra-26', 'lawn-care')$$,
                      'business_limit_reached', 'owners are capped at 25 businesses');
select t.expect_error($q$delete from public.businesses where slug = 'extra-3'$q$, 'permission denied', 'clients cannot delete businesses');
reset role;
delete from public.businesses where slug like 'extra-%';
set role authenticated;

-- --- Bob sets up a rival business and tries to cross tenants -----------------
select t.as_user('00000000-0000-0000-0000-00000000000b', 'bob@example.com');
insert into public.businesses (owner_id, name, slug, trade, is_published)
values ('00000000-0000-0000-0000-00000000000b', 'Rival Lawn', 'rival-lawn', 'lawn-care', true);

select t.ok((select count(*) = 1 from public.businesses), 'Bob sees only his own business');
select t.ok((select count(*) = 0 from public.services), 'Bob cannot see Alice''s services');
select t.ok((select count(*) = 0 from public.business_members where business_id = :'biz_a'), 'Bob cannot see Alice''s team');
select t.expect_error($$insert into public.services (business_id, name, price_cents, duration_minutes)
                        values ('$$ || :'biz_a' || $$', 'Sneaky', 100, 30)$$,
                      'row-level security', 'Bob cannot add services to Alice''s business');
select t.expect_error($$insert into public.businesses (owner_id, name, slug, trade)
                        values ('00000000-0000-0000-0000-00000000000a', 'Fake', 'fake-biz', 'x')$$,
                      'row-level security', 'cannot create a business owned by someone else');
select t.ok((select public.is_slug_available('green-acres') = false), 'slug taken by another owner is unavailable');
select t.ok((select public.is_slug_available('brand-new-slug')), 'unused slug is available');
select id as biz_b from public.businesses where slug = 'rival-lawn' \gset
select t.ok((select public.is_slug_available('rival-lawn', :'biz_b')), 'a business''s own slug counts as available when renaming it');
select t.ok((select public.is_slug_available('rival-lawn') = false), 'without the business id, a taken slug is taken');
select t.ok((select public.is_slug_available('green-acres', :'biz_a') = false), 'cannot claim another owner''s slug by passing their business id');
select t.expect_error('select * from public.stripe_webhook_events', 'permission denied', 'webhook log is service-role only');

-- --- Anonymous visitor ---------------------------------------------------------
reset role;
set role anon;
select set_config('request.jwt.claims', '', false);
select t.expect_error('select * from public.businesses', 'permission denied', 'anon has no direct table access');
select t.expect_error('select * from public.customers', 'permission denied', 'anon cannot read customers');
select t.ok((select public.get_booking_page('green-acres') -> 'business' ->> 'name' = 'Green Acres'), 'anon can load a published booking page');
select t.ok((select not (public.get_booking_page('green-acres') -> 'business' ? 'base_address')), 'booking page never exposes the private base address');
select t.ok((select jsonb_array_length(public.get_booking_page('green-acres') -> 'services') = 2), 'booking page lists public services');
select t.ok((select public.get_booking_page('nope') is null), 'unknown slug returns null');
select t.ok((select count(*) > 0 from public.get_available_slots('green-acres', array[:'svc_mow']::uuid[])), 'anon sees open slots');
select t.ok((select count(*) = 0 from public.get_available_slots('green-acres', array[gen_random_uuid()])), 'unknown service yields no slots');
select t.expect_error($$select * from public.create_booking('$$ || :'biz_a' || $$', array['$$ || :'svc_mow' || $$']::uuid[], now(), '{}', '{}')$$,
                      'permission denied', 'anon cannot create bookings directly');

-- --- Server creates bookings (service role) ------------------------------------
reset role;
set role service_role;
select slot_start as slot1 from public.get_available_slots('green-acres', array[:'svc_mow']::uuid[]) order by 1 offset 2 limit 1 \gset

select * from public.create_booking(:'biz_a', array[:'svc_mow']::uuid[], :'slot1',
    '{"full_name": "Dana Customer", "email": "Dana@Example.com", "phone": "512-555-0100"}',
    '{"line1": "10 Oak Ln", "city": "Austin", "postal_code": "78701", "lat": 30.27, "lng": -97.74}') \gset bk1_
select t.ok(:'bk1_status' = 'confirmed', 'no-deposit booking is confirmed immediately (auto_confirm)');
select t.ok(:bk1_total_cents = 4500, 'booking total comes from the service price snapshot');
select t.ok((select email = 'dana@example.com' from public.customers where id = :'bk1_customer_id'), 'customer email is normalized');

select t.expect_error(format($$select * from public.create_booking(%L, array[%L]::uuid[], %L, '{"full_name":"Eve","email":"eve@example.com"}', '{"line1":"9 Elm St"}')$$,
                             :'biz_a', :'svc_mow', :'slot1'),
                      'slot_unavailable', 'a solo business cannot be double-booked');
select t.expect_error(format($$select * from public.create_booking(%L, array[%L]::uuid[], %L, '{"full_name":"Far","email":"far@example.com"}', '{"line1":"1 Far Rd","lat":40.71,"lng":-74.0}')$$,
                             :'biz_a', :'svc_mow',
                             (select slot_start from public.get_available_slots('green-acres', array[:'svc_mow']::uuid[]) order by 1 offset 5 limit 1)),
                      'outside_service_area', 'addresses outside the service radius are rejected');
select t.ok((select count(*) = 0 from public.get_available_slots('green-acres', array[:'svc_mow']::uuid[]) where slot_start = :'slot1'), 'booked slot disappears from availability');

-- Same customer books again: deduplicated by email
select * from public.create_booking(:'biz_a', array[:'svc_mow']::uuid[], (:'slot1'::timestamptz + interval '1 day'),
    '{"full_name": "Dana C.", "email": "dana@example.com"}', '{"line1": "10 Oak Ln", "postal_code": "78701"}') \gset bk2_
select t.ok(:'bk2_customer_id' = :'bk1_customer_id', 'returning customers are matched by email');
select t.ok((select count(*) = 1 from public.customer_addresses where customer_id = :'bk1_customer_id'), 'identical addresses are reused');

-- --- Crew: Alice invites Carl ---------------------------------------------------
reset role;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a', 'alice@example.com');
select public.create_business_invitation(:'biz_a', 'Carl@Example.com', 'crew') as invite_token \gset
select t.ok((select count(*) = 1 from public.business_invitations where token_hash <> :'invite_token'), 'only a hash of the invite token is stored');

select t.as_user('00000000-0000-0000-0000-00000000000b', 'bob@example.com');
select t.expect_error(format('select public.accept_business_invitation(%L)', :'invite_token'), 'invitation_invalid', 'invites only work for the invited email');
select t.expect_error(format($$select public.create_business_invitation(%L, 'x@example.com')$$, :'biz_a'), 'not_allowed', 'outsiders cannot invite to a business');

select t.as_user('00000000-0000-0000-0000-00000000000c', 'carl@example.com');
select t.ok((select public.accept_business_invitation(:'invite_token') = :'biz_a'), 'Carl accepts his invite');
select t.expect_error(format('select public.accept_business_invitation(%L)', :'invite_token'), 'invitation_invalid', 'invites are single-use');
select t.ok((select count(*) = 2 from public.business_members where business_id = :'biz_a'), 'Carl sees his team');
select t.ok((select count(*) = 2 from public.profiles), 'Carl can read his teammate''s profile (and not Bob''s)');
update public.business_members set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000c';
select t.ok((select role = 'crew' from public.business_members where user_id = '00000000-0000-0000-0000-00000000000c'),
            'crew cannot promote themselves (update matches no rows)');

-- Two members now: the slot Dana took is open again for a second job, assigned to Carl.
reset role;
set role service_role;
select * from public.create_booking(:'biz_a', array[:'svc_mow']::uuid[], :'slot1',
    '{"full_name": "Eve Next", "email": "eve@example.com"}', '{"line1": "9 Elm St"}') \gset bk3_
select id as carl_member from public.business_members where user_id = '00000000-0000-0000-0000-00000000000c' \gset
select t.ok((select assigned_member_id = :'carl_member' from public.bookings where id = :'bk3_booking_id'), 'second crew member picks up the overlapping job');

reset role;
select t.expect_error(format($$insert into public.bookings (business_id, customer_id, assigned_member_id, status, scheduled_start, scheduled_end)
                                select business_id, customer_id, assigned_member_id, 'confirmed', scheduled_start + interval '10 minutes', scheduled_end
                                from public.bookings where id = %L$$, :'bk3_booking_id'),
                      'bookings_no_overlap_per_member', 'the database itself blocks overlapping jobs for one person');

-- --- Crew permissions ------------------------------------------------------------
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000c', 'carl@example.com');
select t.ok((select public.update_job_status(:'bk3_booking_id', 'in_progress') = 'in_progress'), 'crew can start their own job');
select t.expect_error(format($$select public.update_job_status(%L, 'in_progress')$$, :'bk1_booking_id'), 'not_allowed', 'crew cannot change someone else''s job');
select t.expect_error(format($$select public.update_job_status(%L, 'cancelled')$$, :'bk3_booking_id'), 'not_allowed', 'crew cannot cancel jobs');
update public.bookings set internal_notes = 'crew was here' where id = :'bk3_booking_id';
select t.ok((select internal_notes is null from public.bookings where id = :'bk3_booking_id'), 'crew cannot edit bookings directly (update matches no rows)');
select t.ok((select count(*) = 0 from public.payments), 'crew cannot see payments');
select t.ok((select public.update_job_status(:'bk3_booking_id', 'completed') = 'completed'), 'crew can complete their own job');
select t.expect_error(format($$select public.update_job_status(%L, 'confirmed')$$, :'bk3_booking_id'), 'not_allowed', 'crew cannot reopen jobs');

select t.as_user('00000000-0000-0000-0000-00000000000a', 'alice@example.com');
select t.expect_error(format($$select public.update_job_status(%L, 'confirmed')$$, :'bk3_booking_id'), 'Invalid booking status change', 'completed jobs cannot go back to confirmed');
select t.ok((select array_agg(event_type order by id) = array['created', 'status_changed', 'status_changed'] from public.booking_events where booking_id = :'bk3_booking_id'),
            'booking timeline records creation and each status change');
select t.ok((select completed_at is not null and started_at is not null from public.bookings where id = :'bk3_booking_id'), 'status timestamps are stamped');
select t.expect_error(format($$update public.bookings set amount_paid_cents = 999999 where id = %L$$, :'bk1_booking_id'), 'permission denied', 'owners cannot fake payment totals');
select t.expect_error(format($$delete from public.bookings where id = %L$$, :'bk1_booking_id'), 'permission denied', 'bookings cannot be deleted, only cancelled');

-- --- Deposits through Stripe --------------------------------------------------------
reset role;
set role service_role;
insert into public.stripe_connect_accounts (business_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted)
values (:'biz_a', 'acct_123', true, true, true);
select slot_start as slot2 from public.get_available_slots('green-acres', array[:'svc_leaf']::uuid[]) order by 1 offset 20 limit 1 \gset

select * from public.create_booking(:'biz_a', array[:'svc_leaf']::uuid[], :'slot2',
    '{"full_name": "Frank Deposit", "email": "frank@example.com"}', '{"line1": "5 Pine Ct"}') \gset bk4_
select t.ok(:'bk4_status' = 'pending_payment', 'deposit service holds the slot as pending_payment');
select t.ok(:bk4_deposit_due_cents = 6000, '25% deposit on $240 is $60');
select t.ok(:'bk4_stripe_account_id' = 'acct_123', 'connected account returned for the PaymentIntent');
select t.ok((select hold_expires_at > now() from public.bookings where id = :'bk4_booking_id'), 'hold has an expiry');

insert into public.payments (business_id, booking_id, customer_id, kind, status, amount_cents, stripe_account_id, stripe_payment_intent_id)
values (:'biz_a', :'bk4_booking_id', :'bk4_customer_id', 'deposit', 'processing', 6000, 'acct_123', 'pi_dep1');
select t.ok((select status = 'pending_payment' from public.bookings where id = :'bk4_booking_id'), 'processing payment does not confirm yet');

update public.payments set status = 'succeeded', stripe_charge_id = 'ch_dep1' where stripe_payment_intent_id = 'pi_dep1';
select t.ok((select status = 'confirmed' and deposit_paid_cents = 6000 and amount_paid_cents = 6000 and balance_due_cents = 18000
             from public.bookings where id = :'bk4_booking_id'), 'webhook success confirms the booking and rolls up totals');
select t.ok((select succeeded_at is not null from public.payments where stripe_payment_intent_id = 'pi_dep1'), 'succeeded_at stamped');
select t.ok((select count(*) = 1 from public.booking_events where booking_id = :'bk4_booking_id' and event_type = 'payment'), 'payment recorded on the booking timeline');

-- Invoice + balance payment
insert into public.invoices (business_id, booking_id, customer_id, status) values (:'biz_a', :'bk4_booking_id', :'bk4_customer_id', 'open');
select t.ok((select number = 1001 and issued_at is not null from public.invoices where booking_id = :'bk4_booking_id'), 'first invoice is #1001 and stamped issued');
insert into public.payments (business_id, booking_id, customer_id, kind, status, amount_cents, stripe_account_id, stripe_payment_intent_id)
values (:'biz_a', :'bk4_booking_id', :'bk4_customer_id', 'balance', 'succeeded', 18000, 'acct_123', 'pi_bal1');
select t.ok((select balance_due_cents = 0 from public.bookings where id = :'bk4_booking_id'), 'balance paid in full');
select t.ok((select status = 'paid' and paid_at is not null from public.invoices where booking_id = :'bk4_booking_id'), 'invoice flips to paid automatically');

-- Partial refund of the deposit
insert into public.refunds (business_id, payment_id, amount_cents, status, stripe_refund_id)
select :'biz_a', id, 2000, 'succeeded', 're_1' from public.payments where stripe_payment_intent_id = 'pi_dep1';
select t.ok((select status = 'partially_refunded' and amount_refunded_cents = 2000 from public.payments where stripe_payment_intent_id = 'pi_dep1'), 'refund updates the payment');
select t.ok((select amount_refunded_cents = 2000 and balance_due_cents = 2000 and deposit_paid_cents = 4000 from public.bookings where id = :'bk4_booking_id'), 'refund flows through to the booking');
select t.expect_error($$insert into public.refunds (business_id, payment_id, amount_cents, status)
                        select business_id, id, 999999, 'succeeded' from public.payments where stripe_payment_intent_id = 'pi_dep1'$$,
                      'check', 'refunds cannot exceed the payment');
select t.expect_error(format($$delete from public.customers where id = %L$$, :'bk4_customer_id'), 'foreign key', 'customers with bookings/payments cannot be deleted');

-- Expired holds release their slot
select * from public.create_booking(:'biz_a', array[:'svc_leaf']::uuid[], (:'slot2'::timestamptz + interval '1 day'),
    '{"full_name": "Gina Late", "email": "gina@example.com"}', '{"line1": "7 Birch Way"}') \gset bk5_
update public.bookings set hold_expires_at = now() - interval '1 minute' where id = :'bk5_booking_id';
select t.ok((select public.release_expired_holds() >= 1), 'expired holds are released');
select t.ok((select status = 'cancelled' and cancellation_reason = 'Payment hold expired' from public.bookings where id = :'bk5_booking_id'), 'released hold is cancelled with a reason');

-- --- Owner sees money; Bob doesn't ---------------------------------------------------
reset role;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a', 'alice@example.com');
select t.ok((select count(*) = 2 from public.payments), 'owner sees their payments');
select t.ok((select charges_enabled from public.stripe_connect_accounts), 'owner sees payout account status');
select t.expect_error($$update public.payments set amount_cents = 1$$, 'permission denied', 'owners cannot edit payments');
select t.as_user('00000000-0000-0000-0000-00000000000b', 'bob@example.com');
select t.ok((select count(*) = 0 from public.payments) and (select count(*) = 0 from public.bookings) and (select count(*) = 0 from public.invoices),
            'Bob sees none of Alice''s money or jobs');

-- --- Routes ------------------------------------------------------------------------------
select t.as_user('00000000-0000-0000-0000-00000000000a', 'alice@example.com');
insert into public.routes (business_id, member_id, route_date)
select :'biz_a', id, (:'slot2'::timestamptz)::date from public.business_members where user_id = '00000000-0000-0000-0000-00000000000c';
select id as route_id from public.routes \gset
insert into public.route_stops (business_id, route_id, booking_id, sequence) values (:'biz_a', :'route_id', :'bk4_booking_id', 1);
select id as stop_id from public.route_stops \gset

select t.as_user('00000000-0000-0000-0000-00000000000c', 'carl@example.com');
select t.ok((select public.update_route_stop_status(:'stop_id', 'arrived') = 'arrived'), 'crew can update stops on their route');
select t.ok((select status = 'in_progress' from public.bookings where id = :'bk4_booking_id'), 'arriving starts the job');
select t.ok((select status = 'in_progress' and started_at is not null from public.routes where id = :'route_id'), 'route starts with the first stop');
select t.ok((select public.update_route_stop_status(:'stop_id', 'completed') = 'completed'), 'crew completes the stop');
select t.ok((select status = 'completed' from public.bookings where id = :'bk4_booking_id'), 'completing the stop completes the job');

-- --- Storage ---------------------------------------------------------------------------
select t.as_user('00000000-0000-0000-0000-00000000000a', 'alice@example.com');
insert into storage.objects (bucket_id, name, owner_id) values ('business-assets', :'biz_a' || '/logo.png', '00000000-0000-0000-0000-00000000000a');
select t.ok(true, 'owner uploads a logo into their folder');
select t.expect_error($$insert into storage.objects (bucket_id, name) values ('business-assets', '00000000-0000-0000-0000-000000000000/logo.png')$$,
                      'row-level security', 'cannot upload into another business''s folder');
select t.as_user('00000000-0000-0000-0000-00000000000c', 'carl@example.com');
insert into storage.objects (bucket_id, name, owner_id) values ('job-files', :'biz_a' || '/' || :'bk4_booking_id' || '/after.jpg', '00000000-0000-0000-0000-00000000000c');
select t.ok(true, 'crew uploads a job photo');
select t.expect_error(format($$insert into storage.objects (bucket_id, name) values ('business-assets', %L)$$, :'biz_a' || '/logo2.png'),
                      'row-level security', 'crew cannot change business branding');

-- --- Onboarding flow exactly as apps/swathbook-web/src/app/onboarding/actions.ts issues it ---
reset role;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000000d', 'dee@example.com', '{}');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d', 'dee@example.com');
select t.ok((select public.is_slug_available('dee-detail')), 'onboarding: slug check');
insert into public.businesses (name, slug, trade, phone, timezone, base_address, service_radius_miles, owner_id)
values ('Dee Detail', 'dee-detail', 'mobile-detailing', null, 'America/Denver', '9 Shop Rd', 25, '00000000-0000-0000-0000-00000000000d');
select id as biz_d from public.businesses where slug = 'dee-detail' \gset
delete from public.services where business_id = :'biz_d';
insert into public.services (business_id, name, price_cents, duration_minutes, deposit_type, deposit_percent, sort_order)
values (:'biz_d', 'Express wash', 7500, 60, 'percent', 20, 0), (:'biz_d', 'Estimate', 0, 30, 'none', 0, 1);
delete from public.business_hours where business_id = :'biz_d';
insert into public.business_hours (business_id, weekday, opens_at, closes_at) values (:'biz_d', 1, '08:00', '17:00'), (:'biz_d', 2, '08:00', '17:00');
update public.businesses set onboarding_completed_at = now(), is_published = true where id = :'biz_d';
-- Re-run (update path): no owner_id in the update.
update public.businesses set name = 'Dee''s Detail', slug = 'dee-detail', trade = 'mobile-detailing', timezone = 'America/Denver',
       base_address = '9 Shop Rd', service_radius_miles = 30 where id = :'biz_d';
select t.ok((select is_published and name = 'Dee''s Detail' from public.businesses where id = :'biz_d'), 'onboarding: create, publish and re-run all succeed as a normal user');
set role anon;
select t.ok((select jsonb_array_length(public.get_booking_page('dee-detail') -> 'services') = 2), 'onboarding: new booking page is live');

reset role;
select * from finish();
rollback;
