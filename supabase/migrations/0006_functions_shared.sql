-- =============================================================================
-- 0006  Shared internals: audit writer + embedding validation
-- =============================================================================
-- These are deliberately NOT callable by app roles. They exist only so the
-- verification / enrollment entry points can share logic while running as the
-- function owner.

create or replace function public.log_access(
  p_stage         public.access_stage,
  p_decision      public.access_decision,
  p_reason        public.denial_reason,
  p_staff_id      uuid,
  p_company_id    text,
  p_staff_name    text,
  p_floor         public.authorized_floor,
  p_terminal      uuid,
  p_terminal_name text,
  p_score         numeric,
  p_session       uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.access_logs (
    stage, decision, reason, staff_id, scanned_company_id, staff_name_snapshot,
    floor, terminal_profile_id, terminal_name_snapshot, match_score, session_id
  ) values (
    p_stage, p_decision, p_reason, p_staff_id,
    left(coalesce(nullif(btrim(p_company_id), ''), '(empty)'), 64),
    p_staff_name, p_floor, p_terminal, p_terminal_name,
    p_score, p_session
  );
end $$;

revoke all on function public.log_access(
  public.access_stage, public.access_decision, public.denial_reason, uuid, text,
  text, public.authorized_floor, uuid, text, numeric, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Turns a client-supplied float array into a vector, or raises. Rejects wrong
-- dimensionality, non-finite values and vectors that are not L2-normalised —
-- the three cheapest ways to feed the matcher something it was not trained on.
-- ---------------------------------------------------------------------------
create or replace function public.parse_embedding(
  p_values double precision[],
  p_dimensions integer
)
returns extensions.vector
language plpgsql
immutable
set search_path = public, extensions, pg_temp
as $$
declare
  v_norm double precision;
begin
  if p_values is null or cardinality(p_values) <> p_dimensions then
    raise exception 'EMBEDDING_DIMENSIONS' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_values) v
    where v is null or v <> v or v = 'Infinity'::double precision
       or v = '-Infinity'::double precision
  ) then
    raise exception 'EMBEDDING_NOT_FINITE' using errcode = '22023';
  end if;

  select sqrt(sum(v * v)) into v_norm from unnest(p_values) v;
  if v_norm is null or v_norm < 0.90 or v_norm > 1.10 then
    raise exception 'EMBEDDING_NOT_NORMALISED' using errcode = '22023';
  end if;

  return p_values::extensions.vector;
end $$;

revoke all on function public.parse_embedding(double precision[], integer)
  from public, anon, authenticated;

-- Opportunistic housekeeping so verification_sessions cannot grow unbounded.
create or replace function public.purge_stale_sessions()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.verification_sessions
  where expires_at < now() - interval '1 hour';
$$;

revoke all on function public.purge_stale_sessions() from public, anon, authenticated;
