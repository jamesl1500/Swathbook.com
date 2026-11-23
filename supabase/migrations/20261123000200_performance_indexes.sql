-- =============================================================================
-- Indexes for launch traffic
--
-- * The two composite foreign keys had no covering index, so deleting a booking
--   or service had to scan the child table.
-- * my_pending_invitations() looks up open invitations by email on every visit
--   to onboarding. The existing unique index starts with business_id, so it
--   can't serve that lookup.
-- =============================================================================

create index if not exists booking_answers_business_booking_idx
    on public.booking_answers (business_id, booking_id);

create index if not exists service_questions_business_service_idx
    on public.service_questions (business_id, service_id);

create index if not exists business_invitations_pending_email_idx
    on public.business_invitations (email)
    where accepted_at is null and revoked_at is null;
