-- =============================================================================
-- Rate limits for the public, unauthenticated actions
--
-- The booking page's server actions can be called by anyone: placing a
-- booking holds a slot on someone's calendar, and the address lookups call
-- paid Google APIs. hit_rate_limit() counts hits per bucket (an action plus a
-- hashed client IP, sometimes a business) in fixed windows, and says whether
-- this hit is still within the limit.
--
-- The counters are disposable, so the table is unlogged (no WAL, faster
-- writes; emptied after a crash, which only resets the counts) and old windows
-- are swept as it goes. Only the server (service role) can call it.
-- =============================================================================

create unlogged table private.rate_limits (
    bucket text not null,
    window_start timestamptz not null,
    hits integer not null default 1,
    primary key (bucket, window_start)
);

create index rate_limits_window_start_idx on private.rate_limits (window_start);

comment on table private.rate_limits is 'Hit counts per bucket and fixed window, for hit_rate_limit(). Disposable.';

create function public.hit_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_window timestamptz;
    v_hits integer;
begin
    if p_bucket is null or length(p_bucket) not between 1 and 200
        or p_limit is null or p_limit < 1
        or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
        raise exception 'invalid_rate_limit' using errcode = '22023';
    end if;

    v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

    insert into private.rate_limits as r (bucket, window_start, hits)
    values (p_bucket, v_window, 1)
    on conflict (bucket, window_start) do update set hits = r.hits + 1
    returning r.hits into v_hits;

    -- Now and then, clear windows nobody can be in any more (the longest is a day).
    if random() < 0.02 then
        delete from private.rate_limits where window_start < now() - interval '1 day';
    end if;

    return v_hits <= p_limit;
end;
$$;

comment on function public.hit_rate_limit(text, integer, integer) is
    'Counts a hit for p_bucket in the current p_window_seconds window; true while within p_limit. Server only.';

revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
