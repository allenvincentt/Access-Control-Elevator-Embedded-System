-- =============================================================================
-- 0010  Atomic "create staff + enrol face" used by StaffCreateEditModal
-- =============================================================================
-- One transaction, so a rejected face (duplicate, inconsistent captures) can
-- never leave a half-created staff record behind.

create or replace function public.create_staff_with_face(
  p_full_name         text,
  p_email             text,
  p_company_id        text,
  p_authorized_floors public.authorized_floor[],
  p_access_status     public.active_status,
  p_photo_path        text default null,
  p_samples           jsonb default '[]'::jsonb,
  p_model_version     text default 'mobilefacenet-112x112-192d-v1'
)
returns public.staff
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_staff public.staff%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  insert into public.staff
    (full_name, email, company_id, authorized_floors, access_status, photo_path)
  values
    (p_full_name, p_email, p_company_id, p_authorized_floors, p_access_status, p_photo_path)
  returning * into v_staff;

  if p_samples is not null and jsonb_typeof(p_samples) = 'array'
     and jsonb_array_length(p_samples) > 0 then
    perform public.enroll_staff_face(v_staff.id, p_samples, p_model_version);
    select * into v_staff from public.staff where id = v_staff.id;
  end if;

  return v_staff;
end
$fn$;

revoke all on function public.create_staff_with_face(
  text, text, text, public.authorized_floor[], public.active_status, text, jsonb, text)
  from public, anon;

grant execute on function public.create_staff_with_face(
  text, text, text, public.authorized_floor[], public.active_status, text, jsonb, text)
  to authenticated;
