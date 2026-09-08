-- =============================================================================
-- 0009  Admin dashboard aggregate + private photo bucket
-- =============================================================================

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

  select v_result || jsonb_build_object('terminals_online', count(*)) into v_result
  from public.profiles
  where user_role = 'Floor' and is_active;

  return v_result;
end
$fn$;

revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- =============================================================================
-- Storage: private bucket for staff profile pictures.
-- =============================================================================
-- Not public. The app reads through short-lived signed URLs, so an object key
-- leaking is not the same as the photo leaking. Face captures are NEVER
-- uploaded here; only the embedding leaves the device.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-photos', 'staff-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public            = false,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists staff_photos_admin_read   on storage.objects;
drop policy if exists staff_photos_admin_insert on storage.objects;
drop policy if exists staff_photos_admin_update on storage.objects;
drop policy if exists staff_photos_admin_delete on storage.objects;

create policy staff_photos_admin_read
  on storage.objects for select to authenticated
  using (bucket_id = 'staff-photos' and public.is_admin());

create policy staff_photos_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'staff-photos' and public.is_admin());

create policy staff_photos_admin_update
  on storage.objects for update to authenticated
  using (bucket_id = 'staff-photos' and public.is_admin())
  with check (bucket_id = 'staff-photos' and public.is_admin());

create policy staff_photos_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'staff-photos' and public.is_admin());

-- Orphaned photos are cleaned up by the app before it deletes a staff row
-- (see deleteStaff in src/services/staffService.ts). Deleting straight from
-- storage.objects here would drop the metadata row while leaving the actual
-- object behind in the storage backend.
drop trigger if exists staff_photo_cleanup on public.staff;
drop function if exists public.cleanup_staff_photo();
