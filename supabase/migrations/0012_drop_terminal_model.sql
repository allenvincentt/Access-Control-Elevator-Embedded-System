alter table public.profiles          drop column if exists assigned_floor;
alter table public.profiles          alter column user_role set default 'Admin';

drop index if exists public.verification_sessions_terminal_idx;
alter table public.verification_sessions drop column if exists terminal_profile_id;
alter table public.verification_sessions alter column floor drop not null;
alter table public.verification_sessions add column if not exists face_passed_at timestamptz;
alter table public.verification_sessions add column if not exists device_id text;

drop index if exists public.access_logs_terminal_idx;
alter table public.access_logs drop column if exists terminal_profile_id;
alter table public.access_logs drop column if exists terminal_name_snapshot;
alter table public.access_logs add column if not exists device_id text;

create index if not exists access_logs_device_idx
  on public.access_logs (device_id, occurred_at desc)
  where decision = 'Denied';

drop function if exists public.log_access(
  public.access_stage, public.access_decision, public.denial_reason, uuid, text,
  text, public.authorized_floor, uuid, text, numeric, uuid);

create or replace function public.log_access(
  p_stage      public.access_stage,
  p_decision   public.access_decision,
  p_reason     public.denial_reason,
  p_staff_id   uuid,
  p_company_id text,
  p_staff_name text,
  p_floor      public.authorized_floor,
  p_device_id  text,
  p_score      numeric,
  p_session    uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.access_logs (
    stage, decision, reason, staff_id, scanned_company_id, staff_name_snapshot,
    floor, device_id, match_score, session_id
  ) values (
    p_stage, p_decision, p_reason, p_staff_id,
    left(coalesce(nullif(btrim(p_company_id), ''), '(empty)'), 64),
    p_staff_name, p_floor, left(nullif(btrim(p_device_id), ''), 128),
    p_score, p_session
  );
end $$;

revoke all on function public.log_access(
  public.access_stage, public.access_decision, public.denial_reason, uuid, text,
  text, public.authorized_floor, text, numeric, uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := 'Admin';
  v_raw  text;
  v_name text;
begin
  if new.email is null or btrim(new.email) = '' then
    return new;
  end if;

  v_raw := nullif(btrim(coalesce(
             new.raw_app_meta_data  ->> 'user_role',
             new.raw_user_meta_data ->> 'user_role', '')), '');
  if v_raw is not null then
    begin
      v_role := v_raw::public.user_role;
    exception when others then
      v_role := 'Admin';
    end;
  end if;

  v_name := nullif(btrim(coalesce(
              new.raw_user_meta_data ->> 'full_name',
              new.raw_user_meta_data ->> 'name', '')), '');

  insert into public.profiles (id, full_name, email, user_role)
  values (
    new.id,
    coalesce(v_name, split_part(lower(new.email), '@', 1)),
    lower(new.email),
    v_role
  )
  on conflict (id) do nothing;

  return new;
end $$;

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    if new.user_role is distinct from old.user_role
    or new.is_active is distinct from old.is_active
    or new.email     is distinct from old.email
    or new.id        is distinct from old.id then
      raise exception 'Only administrators can change role, status or email'
        using errcode = '42501';
    end if;
  end if;

  if old.user_role = 'Admin'
     and (new.user_role <> 'Admin' or new.is_active = false)
     and (select count(*) from public.profiles
          where user_role = 'Admin' and is_active and id <> old.id) = 0 then
    raise exception 'At least one active administrator must remain'
      using errcode = '23514';
  end if;

  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

drop function if exists public.verify_company_barcode(text);

create or replace function public.verify_company_barcode(
  p_company_id text,
  p_device_id  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_cfg     public.app_config%rowtype;
  v_staff   public.staff%rowtype;
  v_device  text := left(nullif(btrim(coalesce(p_device_id, '')), ''), 128);
  v_code    text;
  v_token   text;
  v_id      uuid;
  v_expires timestamptz;
  v_denials int;
  v_reason  public.denial_reason;
begin
  select * into v_cfg from public.app_config where id;
  perform public.purge_stale_sessions();

  v_code := upper(btrim(coalesce(p_company_id, '')));

  if v_device is not null then
    select count(*) into v_denials
      from public.access_logs
     where device_id = v_device
       and decision = 'Denied'
       and occurred_at > now() - make_interval(secs => v_cfg.terminal_denial_window_seconds);

    if v_denials >= v_cfg.terminal_denial_limit then
      perform public.log_access('Barcode', 'Denied', 'RateLimited', null, v_code, null,
        null, v_device, null, null);
      return jsonb_build_object('ok', false, 'reason', 'RateLimited',
                                'retry_after_seconds', v_cfg.terminal_denial_window_seconds);
    end if;
  end if;

  if v_code !~ '^[A-Z0-9][A-Z0-9-]{2,31}$' then
    perform public.log_access('Barcode', 'Denied', 'InvalidInput', null, v_code, null,
      null, v_device, null, null);
    return jsonb_build_object('ok', false, 'reason', 'InvalidInput');
  end if;

  select * into v_staff from public.staff where company_id = v_code;

  if not found then
    perform public.log_access('Barcode', 'Denied', 'UnknownCompanyId', null, v_code, null,
      null, v_device, null, null);
    return jsonb_build_object('ok', false, 'reason', 'UnknownCompanyId');
  end if;

  select count(*) into v_denials
    from public.access_logs
   where scanned_company_id = v_code
     and decision = 'Denied'
     and occurred_at > now() - make_interval(mins => v_cfg.staff_lockout_window_minutes);

  if v_denials >= v_cfg.staff_lockout_limit then
    perform public.log_access('Barcode', 'Denied', 'RateLimited', v_staff.id, v_code,
      v_staff.full_name, null, v_device, null, null);
    return jsonb_build_object('ok', false, 'reason', 'RateLimited',
                              'retry_after_seconds', v_cfg.staff_lockout_window_minutes * 60);
  end if;

  v_reason := case
    when v_staff.access_status <> 'Active' then 'Suspended'
    when v_staff.face_template_count = 0 then 'NoFaceEnrolled'
    else null
  end;

  if v_reason is not null then
    perform public.log_access('Barcode', 'Denied', v_reason, v_staff.id, v_code,
      v_staff.full_name, null, v_device, null, null);
    return jsonb_build_object(
      'ok', false,
      'reason', v_reason,
      'staff', jsonb_build_object('full_name', v_staff.full_name, 'company_id', v_staff.company_id)
    );
  end if;

  v_token   := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + make_interval(secs => v_cfg.barcode_session_ttl_seconds);

  insert into public.verification_sessions
    (token_hash, staff_id, device_id, expires_at)
  values
    (extensions.digest(v_token, 'sha256'), v_staff.id, v_device, v_expires)
  returning id into v_id;

  perform public.log_access('Barcode', 'Granted', null, v_staff.id, v_code,
    v_staff.full_name, null, v_device, null, v_id);

  return jsonb_build_object(
    'ok', true,
    'session_token', v_token,
    'expires_at', v_expires,
    'staff', jsonb_build_object('full_name', v_staff.full_name, 'company_id', v_staff.company_id)
  );
end
$fn$;

revoke all on function public.verify_company_barcode(text, text) from public;
grant execute on function public.verify_company_barcode(text, text) to anon, authenticated;

drop function if exists public.verify_staff_face(text, double precision[], numeric);

create or replace function public.verify_staff_face(
  p_session_token text,
  p_embedding     double precision[],
  p_quality       numeric,
  p_device_id     text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_cfg       public.app_config%rowtype;
  v_sess      public.verification_sessions%rowtype;
  v_staff     public.staff%rowtype;
  v_device    text := left(nullif(btrim(coalesce(p_device_id, '')), ''), 128);
  v_vec       extensions.vector;
  v_hash      bytea;
  v_sim       double precision;
  v_other_sim double precision;
  v_reason    public.denial_reason;
begin
  select * into v_cfg from public.app_config where id;

  if p_session_token is null or p_session_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'SessionExpired');
  end if;
  v_hash := extensions.digest(p_session_token, 'sha256');

  select * into v_sess
    from public.verification_sessions
   where token_hash = v_hash
     and consumed_at is null
     and expires_at > now()
     and face_passed_at is not null;

  if found then
    select * into v_staff from public.staff where id = v_sess.staff_id;
    return jsonb_build_object(
      'ok', true,
      'authorized_floors', to_jsonb(v_staff.authorized_floors),
      'staff', jsonb_build_object('full_name', v_staff.full_name, 'company_id', v_staff.company_id)
    );
  end if;

  update public.verification_sessions
     set attempts = attempts + 1
   where token_hash = v_hash
     and consumed_at is null
     and expires_at > now()
  returning * into v_sess;

  if not found then
    perform public.log_access('Face', 'Denied', 'SessionExpired', null, '(no-session)', null,
      null, v_device, null, null);
    return jsonb_build_object('ok', false, 'reason', 'SessionExpired');
  end if;

  select * into v_staff from public.staff where id = v_sess.staff_id;

  if v_sess.attempts > v_cfg.face_max_attempts then
    update public.verification_sessions set consumed_at = now() where id = v_sess.id;
    perform public.log_access('Face', 'Denied', 'TooManyAttempts', v_sess.staff_id,
      coalesce(v_staff.company_id, '(deleted)'), v_staff.full_name, null,
      v_device, null, v_sess.id);
    return jsonb_build_object('ok', false, 'reason', 'TooManyAttempts');
  end if;

  v_reason := case
    when v_staff.id is null then 'UnknownCompanyId'
    when v_staff.access_status <> 'Active' then 'Suspended'
    when v_staff.face_template_count = 0 then 'NoFaceEnrolled'
    else null
  end;

  if v_reason is not null then
    update public.verification_sessions set consumed_at = now() where id = v_sess.id;
    perform public.log_access('Face', 'Denied', v_reason, v_sess.staff_id,
      coalesce(v_staff.company_id, '(deleted)'), v_staff.full_name, null,
      v_device, null, v_sess.id);
    return jsonb_build_object('ok', false, 'reason', v_reason);
  end if;

  if p_quality is null or p_quality < v_cfg.face_min_quality then
    perform public.log_access('Face', 'Denied', 'LowQuality', v_staff.id, v_staff.company_id,
      v_staff.full_name, null, v_device, null, v_sess.id);
    return jsonb_build_object('ok', false, 'reason', 'LowQuality',
                              'attempts_left', v_cfg.face_max_attempts - v_sess.attempts);
  end if;

  begin
    v_vec := public.parse_embedding(p_embedding, v_cfg.embedding_dimensions);
  exception when others then
    perform public.log_access('Face', 'Denied', 'InvalidInput', v_staff.id, v_staff.company_id,
      v_staff.full_name, null, v_device, null, v_sess.id);
    return jsonb_build_object('ok', false, 'reason', 'InvalidInput');
  end;

  select 1 - (t.embedding <=> v_vec) into v_sim
    from public.staff_face_templates t
   where t.staff_id = v_staff.id
   order by t.embedding <=> v_vec
   limit 1;

  select 1 - (t.embedding <=> v_vec) into v_other_sim
    from public.staff_face_templates t
   where t.staff_id <> v_staff.id
   order by t.embedding <=> v_vec
   limit 1;

  if v_sim is null
     or v_sim < v_cfg.face_match_threshold
     or (v_other_sim is not null and v_sim < v_other_sim + v_cfg.face_impostor_margin) then
    perform public.log_access('Face', 'Denied', 'FaceMismatch', v_staff.id, v_staff.company_id,
      v_staff.full_name, null, v_device, round(coalesce(v_sim, 0)::numeric, 5), v_sess.id);
    return jsonb_build_object('ok', false, 'reason', 'FaceMismatch',
                              'attempts_left', v_cfg.face_max_attempts - v_sess.attempts);
  end if;

  update public.verification_sessions
     set face_passed_at = now()
   where id = v_sess.id and consumed_at is null;

  return jsonb_build_object(
    'ok', true,
    'authorized_floors', to_jsonb(v_staff.authorized_floors),
    'score', round(v_sim::numeric, 4),
    'staff', jsonb_build_object('full_name', v_staff.full_name, 'company_id', v_staff.company_id)
  );
end
$fn$;

revoke all on function public.verify_staff_face(text, double precision[], numeric, text) from public;
grant execute on function public.verify_staff_face(text, double precision[], numeric, text) to anon, authenticated;

create or replace function public.commit_floor_access(
  p_session_token text,
  p_floor         public.authorized_floor,
  p_device_id     text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_sess     public.verification_sessions%rowtype;
  v_staff    public.staff%rowtype;
  v_device   text := left(nullif(btrim(coalesce(p_device_id, '')), ''), 128);
  v_hash     bytea;
  v_consumed uuid;
begin
  if p_session_token is null or p_session_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'SessionExpired');
  end if;
  v_hash := extensions.digest(p_session_token, 'sha256');

  select * into v_sess
    from public.verification_sessions
   where token_hash = v_hash
     and consumed_at is null
     and expires_at > now()
     and face_passed_at is not null;

  if not found then
    perform public.log_access('Face', 'Denied', 'SessionExpired', null, '(no-session)', null,
      null, v_device, null, null);
    return jsonb_build_object('ok', false, 'reason', 'SessionExpired');
  end if;

  select * into v_staff from public.staff where id = v_sess.staff_id;

  if v_staff.id is null or v_staff.access_status <> 'Active' then
    update public.verification_sessions set consumed_at = now() where id = v_sess.id;
    perform public.log_access('Face', 'Denied', 'Suspended', v_sess.staff_id,
      coalesce(v_staff.company_id, '(deleted)'), v_staff.full_name, p_floor,
      v_device, null, v_sess.id);
    return jsonb_build_object('ok', false, 'reason', 'Suspended');
  end if;

  if not (p_floor = any (v_staff.authorized_floors)) then
    update public.verification_sessions set consumed_at = now() where id = v_sess.id;
    perform public.log_access('Face', 'Denied', 'FloorNotAuthorized', v_staff.id,
      v_staff.company_id, v_staff.full_name, p_floor, v_device, null, v_sess.id);
    return jsonb_build_object('ok', false, 'reason', 'FloorNotAuthorized');
  end if;

  update public.verification_sessions
     set consumed_at = now(), floor = p_floor
   where id = v_sess.id and consumed_at is null
  returning id into v_consumed;

  if v_consumed is null then
    perform public.log_access('Face', 'Denied', 'SessionExpired', v_staff.id,
      v_staff.company_id, v_staff.full_name, p_floor, v_device, null, v_sess.id);
    return jsonb_build_object('ok', false, 'reason', 'SessionExpired');
  end if;

  perform public.log_access('Face', 'Granted', null, v_staff.id, v_staff.company_id,
    v_staff.full_name, p_floor, v_device, null, v_sess.id);

  return jsonb_build_object(
    'ok', true,
    'floor', p_floor,
    'staff', jsonb_build_object('full_name', v_staff.full_name, 'company_id', v_staff.company_id)
  );
end
$fn$;

revoke all on function public.commit_floor_access(text, public.authorized_floor, text) from public;
grant execute on function public.commit_floor_access(text, public.authorized_floor, text) to anon, authenticated;

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
     and consumed_at is null;
end
$fn$;

revoke all on function public.cancel_verification_session(text) from public;
grant execute on function public.cancel_verification_session(text) to anon, authenticated;

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'staff_total',      count(*),
    'staff_active',     count(*) filter (where access_status = 'Active'),
    'staff_suspended',  count(*) filter (where access_status = 'Suspended'),
    'faces_enrolled',   count(*) filter (where face_template_count > 0),
    'faces_missing',    count(*) filter (where face_template_count = 0)
  ) into v_result
  from public.staff;

  select v_result || jsonb_build_object(
    'granted_24h',  count(*) filter (where decision = 'Granted' and stage = 'Face'),
    'denied_24h',   count(*) filter (where decision = 'Denied'),
    'attempts_24h', count(*) filter (where stage = 'Barcode')
  ) into v_result
  from public.access_logs
  where occurred_at > now() - interval '24 hours';

  return v_result;
end
$fn$;

revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;
