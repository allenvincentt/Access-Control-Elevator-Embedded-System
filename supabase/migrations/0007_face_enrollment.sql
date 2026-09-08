-- =============================================================================
-- 0007  Face enrollment (admin only)
-- =============================================================================
-- p_samples: [{ "embedding": [192 floats], "quality": 0.0-1.0 }, ...]
-- Between 1 and 5 captures of the SAME person. Re-enrolling replaces the whole
-- template set atomically.

create or replace function public.enroll_staff_face(
  p_staff_id      uuid,
  p_samples       jsonb,
  p_model_version text default 'mobilefacenet-112x112-192d-v1'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cfg      public.app_config%rowtype;
  v_staff    public.staff%rowtype;
  v_vecs     extensions.vector[] := '{}';
  v_quals    numeric[] := '{}';
  v_elem     jsonb;
  v_raw      double precision[];
  v_quality  numeric;
  v_count    int;
  i          int;
  j          int;
  v_sim      double precision;
  v_worst    double precision := 1;
  v_dup_sim  double precision;
  v_dup_code text;
  v_dup_name text;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_cfg from public.app_config where id;

  select * into v_staff from public.staff where id = p_staff_id for update;
  if not found then
    raise exception 'STAFF_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_samples is null or jsonb_typeof(p_samples) <> 'array' then
    raise exception 'SAMPLES_INVALID' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_samples);
  if v_count < 1 or v_count > 5 then
    raise exception 'SAMPLES_COUNT' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_model_version, ''))) not between 3 and 64 then
    raise exception 'MODEL_VERSION_INVALID' using errcode = '22023';
  end if;

  -- 1. Structural validation of every capture.
  for v_elem in select value from jsonb_array_elements(p_samples) loop
    select array_agg(x::double precision order by o)
      into v_raw
      from jsonb_array_elements_text(v_elem -> 'embedding') with ordinality t(x, o);

    v_quality := coalesce((v_elem ->> 'quality')::numeric, 0);
    if v_quality < 0 or v_quality > 1 then
      raise exception 'QUALITY_RANGE' using errcode = '22023';
    end if;
    if v_quality < v_cfg.face_min_quality then
      raise exception 'QUALITY_TOO_LOW' using errcode = '22023';
    end if;

    v_vecs  := array_append(v_vecs, public.parse_embedding(v_raw, v_cfg.embedding_dimensions));
    v_quals := array_append(v_quals, v_quality);
  end loop;

  -- 2. The captures must agree with each other. If they do not, the admin
  --    photographed two different people or the crops were unusable.
  if v_count > 1 then
    for i in 1 .. v_count - 1 loop
      for j in i + 1 .. v_count loop
        v_sim := 1 - (v_vecs[i] <=> v_vecs[j]);
        if v_sim < v_worst then v_worst := v_sim; end if;
      end loop;
    end loop;
    if v_worst < v_cfg.enrollment_consistency_min then
      raise exception 'CAPTURES_INCONSISTENT' using errcode = '22023';
    end if;
  end if;

  -- 3. This face must not already belong to somebody else.
  for i in 1 .. v_count loop
    select 1 - (t.embedding <=> v_vecs[i]), s.company_id, s.full_name
      into v_dup_sim, v_dup_code, v_dup_name
      from public.staff_face_templates t
      join public.staff s on s.id = t.staff_id
     where t.staff_id <> p_staff_id
     order by t.embedding <=> v_vecs[i]
     limit 1;

    if v_dup_sim is not null and v_dup_sim >= v_cfg.face_duplicate_threshold then
      raise exception 'DUPLICATE_FACE:%:%', v_dup_code, v_dup_name using errcode = '23505';
    end if;
  end loop;

  -- 4. Replace the template set atomically.
  delete from public.staff_face_templates where staff_id = p_staff_id;

  for i in 1 .. v_count loop
    insert into public.staff_face_templates (staff_id, embedding, model_version, quality, created_by)
    values (p_staff_id, v_vecs[i], btrim(p_model_version), v_quals[i], (select auth.uid()));
  end loop;

  perform set_config('app.biometric_write', 'on', true);
  update public.staff
     set face_enrolled_at    = now(),
         face_template_count = v_count
   where id = p_staff_id;
  perform set_config('app.biometric_write', 'off', true);

  -- Any face session opened against the old template set is now meaningless.
  delete from public.verification_sessions where staff_id = p_staff_id and consumed_at is null;

  return jsonb_build_object(
    'ok', true,
    'staff_id', p_staff_id,
    'template_count', v_count,
    'model_version', btrim(p_model_version),
    'min_pairwise_similarity', round(v_worst::numeric, 4)
  );
end $$;

revoke all on function public.enroll_staff_face(uuid, jsonb, text) from public, anon;
grant execute on function public.enroll_staff_face(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Clear an enrollment (staff must re-enrol before they can pass stage 2).
-- ---------------------------------------------------------------------------
create or replace function public.reset_staff_face(p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  delete from public.staff_face_templates where staff_id = p_staff_id;
  delete from public.verification_sessions where staff_id = p_staff_id and consumed_at is null;

  perform set_config('app.biometric_write', 'on', true);
  update public.staff
     set face_enrolled_at = null, face_template_count = 0
   where id = p_staff_id;
  perform set_config('app.biometric_write', 'off', true);

  return jsonb_build_object('ok', true, 'staff_id', p_staff_id);
end $$;

revoke all on function public.reset_staff_face(uuid) from public, anon;
grant execute on function public.reset_staff_face(uuid) to authenticated;
