-- =============================================================================
-- 0005  Row Level Security
-- =============================================================================
-- Default posture: deny. Every table below has RLS enabled; anything without a
-- matching policy is unreachable through the API for every role except the
-- service_role key (which is never shipped to the app).

alter table public.profiles              enable row level security;
alter table public.staff                 enable row level security;
alter table public.staff_face_templates  enable row level security;
alter table public.verification_sessions enable row level security;
alter table public.access_logs           enable row level security;
alter table public.app_config            enable row level security;

-- FORCE is deliberately NOT used: it would also apply RLS to the table owner,
-- which is exactly the role the SECURITY DEFINER verification functions run as.
-- Those functions are the only sanctioned path into the biometric tables.

-- --------------------------------------------------------------- profiles --
drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

-- Column-level protection lives in the protect_profile_columns() trigger:
-- a non-admin passing this policy still cannot change role, floor or status.
drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- No INSERT policy: rows are created only by the handle_new_user() trigger.
-- No DELETE policy: removing the auth user cascades the profile away.

-- ------------------------------------------------------------------ staff --
-- Floor terminals get no direct access to staff rows at all. Everything they
-- are allowed to learn comes back from the verification RPCs, field by field.
drop policy if exists staff_admin_select on public.staff;
create policy staff_admin_select
  on public.staff for select to authenticated
  using (public.is_admin());

drop policy if exists staff_admin_insert on public.staff;
create policy staff_admin_insert
  on public.staff for insert to authenticated
  with check (public.is_admin());

drop policy if exists staff_admin_update on public.staff;
create policy staff_admin_update
  on public.staff for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists staff_admin_delete on public.staff;
create policy staff_admin_delete
  on public.staff for delete to authenticated
  using (public.is_admin());

-- ------------------------------------------------- staff_face_templates ----
-- Intentionally NO policies. Biometric templates are not readable or writable
-- through PostgREST by anyone, including administrators. The only paths in and
-- out are enroll_staff_face() and verify_staff_face(), both SECURITY DEFINER.

-- ------------------------------------------------ verification_sessions ----
-- Intentionally NO policies. Managed entirely by the verification RPCs.

-- ------------------------------------------------------------ access_logs --
drop policy if exists access_logs_admin_select on public.access_logs;
create policy access_logs_admin_select
  on public.access_logs for select to authenticated
  using (public.is_admin());

-- No INSERT policy: only the SECURITY DEFINER verification RPCs write logs, so
-- a Floor terminal cannot forge or suppress an entry.

-- ------------------------------------------------------------- app_config --
drop policy if exists app_config_admin_select on public.app_config;
create policy app_config_admin_select
  on public.app_config for select to authenticated
  using (public.is_admin());

drop policy if exists app_config_admin_update on public.app_config;
create policy app_config_admin_update
  on public.app_config for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------- grants ---
-- Least privilege at the grant layer as well, so a future policy mistake on
-- one table cannot expose the biometric tables.
revoke all on all tables in schema public from anon, authenticated;

grant select, insert, update, delete on public.staff       to authenticated;
grant select, update                 on public.profiles    to authenticated;
grant select                         on public.access_logs to authenticated;
grant select, update                 on public.app_config  to authenticated;
-- staff_face_templates and verification_sessions: no grants at all.

revoke all on all functions in schema public from anon;
