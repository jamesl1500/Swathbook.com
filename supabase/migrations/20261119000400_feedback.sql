-- =============================================================================
-- Product feedback from early users
--
-- Anyone signed in (business owners and crews on the web dashboard and the
-- owner app, customers in the customer portal and the customer app) can send
-- an idea, a problem, praise or anything else, with an optional 1-5 rating.
-- Each note records where it came from (source, page or screen, app version,
-- platform) so the team can act on it.
--
--   submit_feedback()   the only way in: checks the input, rate limits per
--                       user, and fills in who sent it
--   feedback            people read their own notes (status and any reply
--                       from the team); the team reads everything with the
--                       service role (the /admin/feedback inbox)
--
-- New notes are emailed to the team in batches by the minute cron (see
-- libs/feedback.ts), which stamps team_notified_at.
-- =============================================================================

create type public.feedback_kind as enum ('idea', 'problem', 'praise', 'other');
create type public.feedback_source as enum ('web', 'owner_app', 'client_app');
create type public.feedback_status as enum ('new', 'reviewing', 'planned', 'done', 'closed');

create table public.feedback (
    id uuid primary key default gen_random_uuid(),
    -- Kept (without the person) if they delete their account.
    user_id uuid references auth.users (id) on delete set null,
    business_id uuid references public.businesses (id) on delete set null,
    source public.feedback_source not null,
    kind public.feedback_kind not null,
    rating smallint check (rating between 1 and 5),
    message text not null check (char_length(message) between 3 and 4000),
    page text check (char_length(page) <= 300),
    app_version text check (char_length(app_version) <= 40),
    platform text check (char_length(platform) <= 200),
    -- The sender's email when they sent it, and whether they're happy to hear back.
    email text check (char_length(email) <= 320),
    contact_ok boolean not null default true,
    status public.feedback_status not null default 'new',
    response text check (char_length(response) <= 2000),
    responded_at timestamptz,
    team_notified_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.feedback is 'Product feedback from signed-in users. Written only through submit_feedback(); triaged by the team with the service role.';

create index feedback_created_idx on public.feedback (created_at desc);
create index feedback_user_idx on public.feedback (user_id, created_at desc);
create index feedback_business_idx on public.feedback (business_id);
create index feedback_unnotified_idx on public.feedback (created_at) where team_notified_at is null;

create trigger feedback_set_updated_at
    before update on public.feedback
    for each row execute function private.set_updated_at();

alter table public.feedback enable row level security;

create policy "People read their own feedback"
    on public.feedback for select to authenticated
    using (user_id = (select auth.uid()));

revoke all on public.feedback from anon, authenticated;
grant select (id, source, kind, rating, message, page, status, response, responded_at, created_at)
    on public.feedback to authenticated;

-- -----------------------------------------------------------------------------
-- submit_feedback
-- -----------------------------------------------------------------------------

create function public.submit_feedback(
    p_source public.feedback_source,
    p_kind public.feedback_kind,
    p_message text,
    p_rating integer default null,
    p_page text default null,
    p_app_version text default null,
    p_platform text default null,
    p_business_id uuid default null,
    p_contact_ok boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_user uuid := (select auth.uid());
    v_message text := btrim(coalesce(p_message, ''));
    v_business uuid;
    v_row public.feedback%rowtype;
begin
    if v_user is null then
        raise exception 'not_signed_in' using errcode = '42501';
    end if;
    if char_length(v_message) < 3 or char_length(v_message) > 4000 then
        raise exception 'invalid_message' using errcode = '22023';
    end if;
    if p_rating is not null and p_rating not between 1 and 5 then
        raise exception 'invalid_rating' using errcode = '22023';
    end if;

    -- A handful an hour is plenty for a person; more is a stuck button or a script.
    if (select count(*) from public.feedback f where f.user_id = v_user and f.created_at > now() - interval '1 hour') >= 10
        or (select count(*) from public.feedback f where f.user_id = v_user and f.created_at > now() - interval '1 day') >= 30 then
        raise exception 'feedback_rate_limited' using errcode = 'P0001';
    end if;

    -- Only a business the sender is on (anything else is dropped, not trusted).
    if p_business_id is not null and p_business_id in (select private.member_business_ids()) then
        v_business := p_business_id;
    end if;

    insert into public.feedback (user_id, business_id, source, kind, rating, message, page, app_version, platform, email, contact_ok)
    values (
        v_user,
        v_business,
        p_source,
        p_kind,
        p_rating::smallint,
        v_message,
        nullif(left(btrim(coalesce(p_page, '')), 300), ''),
        nullif(left(btrim(coalesce(p_app_version, '')), 40), ''),
        nullif(left(btrim(coalesce(p_platform, '')), 200), ''),
        (select u.email from auth.users u where u.id = v_user),
        coalesce(p_contact_ok, true)
    )
    returning * into v_row;

    return jsonb_build_object(
        'id', v_row.id,
        'source', v_row.source,
        'kind', v_row.kind,
        'rating', v_row.rating,
        'message', v_row.message,
        'page', v_row.page,
        'status', v_row.status,
        'response', v_row.response,
        'responded_at', v_row.responded_at,
        'created_at', v_row.created_at
    );
end;
$$;

comment on function public.submit_feedback(public.feedback_source, public.feedback_kind, text, integer, text, text, text, uuid, boolean) is
    'Sends product feedback as the signed-in user. Rate limited to 10 an hour and 30 a day per person.';

revoke all on function public.submit_feedback(public.feedback_source, public.feedback_kind, text, integer, text, text, text, uuid, boolean) from public, anon;
grant execute on function public.submit_feedback(public.feedback_source, public.feedback_kind, text, integer, text, text, text, uuid, boolean)
    to authenticated, service_role;
