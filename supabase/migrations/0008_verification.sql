-- =============================================================================
-- 0008  Two-stage verification used by the Floor terminal
-- =============================================================================
-- Stage 1: verify_company_barcode() -> single-use session token
-- Stage 2: verify_staff_face()      -> grant / deny
-- Both stages write an access_logs row on every outcome.

-- ------------------------------------------------- stage 1: barcode scan ---
create or replace function public.verify_company_barcode(p_company_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_uid     uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_cfg     public.app_config%rowtype;
  v_staff   public.staff%rowtype;
  v_code    text;
  v_token   text;
  v_id      uuid;
  v_expires timestamptz;
  v_denials int;
  v_reason  public.denial_reason;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid and is_active;
  if not found or v_profile.user_role not in ('Floor', 'Admin') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_cfg from public.app_config where id;
  perform public.purge_stale_sessions();

  v_code := upper(btrim(coalesce(p_company_id, '')));

  -- A terminal that is not pinned to a floor cannot authorise anything.
  if v_profile.assigned_floor is null then
    perform public.log_access('Barcode', 'Denied', 'TerminalNotConfigured', null,
      v_code, null, null, v_uid, v_profile.full_name, null, null);
    return jsonb_build_object('ok', false, 'reason', 'TerminalNotConfigured');
  end if;

  -- Throttle a terminal that is producing denials, before touching staff data.
  select count(*) into v_denials
    from public.access_logs
   where terminal_profile_id = v_uid
     and decision = 'Denied'
     and occurred_at > now() - make_interval(secs => v_cfg.terminal_denial_window_seconds);

  if v_denials >= v_cfg.terminal_denial_limit then
    perform public.log_access('Barcode', 'Denied', 'RateLimited', null, v_code, null,
      v_profile.assigned_floor, v_uid, v_profile.full_name, null, null);
    return jsonb_build_object('ok', false, 'reason', 'RateLimited',
                              'retry_after_seconds', v_cfg.terminal_denial_window_seconds);
  end if;

  -- Allow-list the barcode payload before it reaches a lookup.
  if v_code !~ '^[A-Z0-9][A-Z0-9-]{2,31}$' then
    perform public.log_access('Barcode', 'Denied', 'InvalidInput', null, v_code, null,
      v_profile.assigned_floor, v_uid, v_profile.full_name, null, null);
    return jsonb_build_object('ok', false, 'reason', 'InvalidInput');
  end if;

  select * into v_staff from public.staff where company_id = v_code;

  if not found then
    perform public.log_access('Barcode', 'Denied', 'UnknownCompanyId', null, v_code, null,
      v_profile.assigned_floor, v_uid, v_profile.full_name, null, null);
    return jsonb_build_object('ok', false, 'reason', 'UnknownCompanyId');
  end if;

  -- Per-person lockout: repeated denials against one company ID look like a
  -- stolen or cloned badge being probed.
  select count(*) into v_denials
    from public.access_logs
   where scanned_company_id = v_code
     and decision = 'Denied'
     and occurred_at > now() - make_interval(mins => v_cfg.staff_lockout_window_minutes);

  if v_denials >= v_cfg.staff_lockout_limit then
    perform public.log_access('Barcode', 'Denied', 'RateLimited', v_staff.id, v_code,
      v_staff.full_name, v_profile.assigned_floor, v_uid, v_profile.full_name, null, null);
    return jsonb_build_object('ok', false, 'reason', 'RateLimited',
                              'retry_after_seconds', v_cfg.staff_lockout_window_minutes * 60);
  end if;

  v_reason := case
    when v_staff.access_status <> 'Active' then 'Suspended'
    when not (v_profile.assigned_floor = any (v_staff.authorized_floors)) then 'FloorNotAuthorized'
    when v_staff.face_template_count = 0 then 'NoFaceEnrolled'
    else null
  end;

  if v_reason is not null then
    perform public.log_access('Barcode', 'Denied', v_reason, v_staff.id, v_code,
      v_staff.full_name, v_profile.assigned_floor, v_uid, v_profile.full_name, null, null);
    return jsonb_build_object(
      'ok', false,
      'reason', v_reason,
      'staff', jsonb_build_object('full_name', v_staff.full_name, 'company_id', v_staff.company_id)
    );
  end if;

  -- Stage 1 passed: mint a single-use, short-lived token bound to this
  -- terminal, this staff member and this floor.
  v_token   := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + make_interval(secs => v_cfg.barcode_session_ttl_seconds);

  insert into public.verification_sessions
    (token_hash, staff_id, terminal_profile_id, floor, expires_at)
  values
    (extensions.digest(v_token, 'sha256'), v_staff.id, v_uid, v_profile.assigned_floor, v_expires)
  returning id into v_id;

  perform public.log_access('Barcode', 'Granted', null, v_staff.id, v_code,
    v_staff.full_name, v_profile.assigned_floor, v_uid, v_profile.full_name, null, v_id);

  return jsonb_build_object(
    'ok', true,
    'session_token', v_token,
    'expires_at', v_expires,
    'floor', v_profile.assigned_floor,
    'staff', jsonb_build_object('full_name', v_staff.full_name, 'company_id', v_staff.company_id)
  );
end
$fn$;

revoke all on function public.verify_company_barcode(text) from public, anon;
grant execute on function public.verify_company_barcode(text) to authenticated;

-- --------------------------------------------------- stage 2: face match ---
create or replace function public.verify_staff_face(
  p_session_token text,
  p_embedding     double precision[],
  p_quality       numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_uid       uuid := (select auth.uid());
  v_profile   public.profiles%rowtype;
  v_cfg       public.app_config%rowtype;
  v_sess      public.verification_sessions%rowtype;
  v_staff     public.staff%rowtype;
  v_vec       extensions.vector;
  v_hash      bytea;
  v_sim       double precision;
  v_other_sim double precision;
  v_consumed  uuid;
  v_reason    public.denial_reason;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid and is_active;
  if not found or v_profile.user_role not in ('Floor', 'Admin') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_cfg from public.app_config where id;

  if p_session_token is null or p_session_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'SessionExpired');
  end if;
  v_hash := extensions.digest(p_session_token, 'sha256');

  -- Atomic check-then-act: find a live session and burn one attempt in the
  -- same statement, so two concurrent calls cannot share an attempt budget.
  update public.verification_sessions
     set attempts = attempts + 1
   where token_hash = v_hash
     and terminal_profile_id = v_uid
     and consumed_at is null
     and expires_at > now()
  returning * into v_sess;

  if not found then
    perform public.log_access('Face', 'Denied', 'SessionExpired', null, '(no-session)', null,
      v_profile.assigned_floor, v_uid, v_profile.full_name, null, null);
    return jsonb_build_object('ok', false, 'reason', 'SessionExpired');
  end if;

  select * into v_staff from public.staff where id = v_sess.staff_id;

  if v_sess.attempts > v_cfg.face_max_attempts then
    update public.verification_sessions set consumed_at = now() where id = v_sess.id;
    perform public.log_access('Face', 'Denied', 'TooManyAttempts', v_sess.staff_id,
      coalesce(v_staff.company_id, '(deleted)'), v_staff.full_name, v_sess.floor,
      v_uid, v_profile.full_name, null, v_sess.id);
    return jsonb_build_object('ok', false, 'reason', 'TooManyAttempts');
  end if;

  -- Re-check authorisation: the record may have been suspended or had its
  -- floors changed in the seconds between the two stages.
  v_reason := case
    when v_staff.id is null then 'UnknownCompanyId'
    when v_staff.access_status <> 'Active' then 'Suspended'
    when not (v_sess.floor = any (v_staff.authorized_floors)) then 'FloorNotAuthorized'
    when v_staff.face_template_count = 0 then 'NoFaceEnrolled'
    else null
  end;

  if v_reason is not null then
    update public.verification_sessions set consumed_at = now() where id = v_sess.id;
    perform public.log_access('Face', 'Denied', v_reason, v_sess.staff_id,
      coalesce(v_staff.company_id, '(deleted)'), v_staff.full_name, v_sess.floor,
      v_uid, v_profile.full_name, null, v_sess.id);
    return jsonb_build_object('ok', false, 'reason', v_reason);
  end if;

  if p_quality is null or p_quality < v_cfg.face_min_quality then
    perform public.log_access('Face', 'Denied', 'LowQuality', v_staff.id, v_staff.company_id,
      v_staff.full_name, v_sess.floor, v_uid, v_profile.full_name, null, v_sess.id);
    return jsonb_build_object('ok', false, 'reason', 'LowQuality',
                              'attempts_left', v_cfg.face_max_attempts - v_sess.attempts);
  end if;

  begin
    v_vec := public.parse_embedding(p_embedding, v_cfg.embedding_dimensions);
  exception when others then
    perform public.log_access('Face', 'Denied', 'InvalidInput', v_staff.id, v_staff.company_id,
      v_staff.full_name, v_sess.floor, v_uid, v_profile.full_name, null, v_sess.id);
    return jsonb_build_object('ok', false, 'reason', 'InvalidInput');
  end;

  -- Closest template belonging to the scanned badge...
  select 1 - (t.embedding <=> v_vec) into v_sim
    from public.staff_face_templates t
   where t.staff_id = v_staff.id
   order by t.embedding <=> v_vec
   limit 1;

  -- ...and the closest template belonging to anybody else. If a stranger is
  -- nearer than the badge holder, this is an impostor even when the raw score
  -- clears the threshold.
  select 1 - (t.embedding <=> v_vec) into v_other_sim
    from public.staff_face_templates t
   where t.staff_id <> v_staff.id
   order by t.embedding <=> v_vec
   limit 1;

  if v_sim is null
     or v_sim < v_cfg.face_match_threshold
     or (v_other_sim is not null and v_sim < v_other_sim + v_cfg.face_impostor_margin) then
    perform public.log_access('Face', 'Denied', 'FaceMismatch', v_staff.id, v_staff.company_id,
      v_staff.full_name, v_sess.floor, v_uid, v_profile.full_name,
      round(coalesce(v_sim, 0)::numeric, 5), v_sess.id);
    return jsonb_build_object('ok', false, 'reason', 'FaceMismatch',
                              'attempts_left', v_cfg.face_max_attempts - v_sess.attempts);
  end if;

  -- Burn the session. If another request consumed it first, deny rather than
  -- grant twice off one barcode scan.
  update public.verification_sessions
     set consumed_at = now()
   where id = v_sess.id and consumed_at is null
  returning id into v_consumed;

  if v_consumed is null then
    perform public.log_access('Face', 'Denied', 'SessionExpired', v_staff.id, v_staff.company_id,
      v_staff.full_name, v_sess.floor, v_uid, v_profile.full_name, null, v_sess.id);
    return jsonb_build_object('ok', false, 'reason', 'SessionExpired');
  end if;

  perform public.log_access('Face', 'Granted', null, v_staff.id, v_staff.company_id,
    v_staff.full_name, v_sess.floor, v_uid, v_profile.full_name,
    round(v_sim::numeric, 5), v_sess.id);

  return jsonb_build_object(
    'ok', true,
    'floor', v_sess.floor,
    'score', round(v_sim::numeric, 4),
    'staff', jsonb_build_object('full_name', v_staff.full_name, 'company_id', v_staff.company_id)
  );
end
$fn$;

revoke all on function public.verify_staff_face(text, double precision[], numeric) from public, anon;
grant execute on function public.verify_staff_face(text, double precision[], numeric) to authenticated;

-- Abandon a session when the operator backs out of the face step.
create or replace function public.cancel_verification_session(p_session_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
begin
  if p_session_token is null or p_session_token !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  update public.verification_sessions
     set consumed_at = now()
   where token_hash = extensions.digest(p_session_token, 'sha256')
     and terminal_profile_id = (select auth.uid())
     and consumed_at is null;
end
$fn$;

revoke all on function public.cancel_verification_session(text) from public, anon;
grant execute on function public.cancel_verification_session(text) to authenticated;
