-- =============================================================================
-- 0002  profiles  (app identity for the two auth roles: Admin and Floor)
-- =============================================================================
-- Staff members are NOT auth users. Only Admins and Floor terminals sign in.

create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text not null
                 check (char_length(btrim(full_name)) between 2 and 120),
  email          text not null
                 check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  user_role      public.user_role not null default 'Floor',
  -- Which floor this device guards. Required for Floor terminals; the
  -- verification RPCs refuse to run without it, so a terminal can never be
  -- used to open a floor it was not deployed on.
  assigned_floor public.authorized_floor,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists profiles_email_key on public.profiles (lower(email));
create index if not exists profiles_role_idx on public.profiles (user_role) where is_active;

comment on table public.profiles is
  'Application identity mirrored from auth.users. Role is authoritative here, never in the JWT payload.';

-- ---------------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER so that RLS policies on profiles can call
-- them without recursing into the profiles policies.
-- ---------------------------------------------------------------------------
create or replace function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.user_role
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.user_role = 'Admin' and p.is_active
     from public.profiles p
     where p.id = (select auth.uid())),
    false);
$$;

revoke all on function public.auth_role() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.auth_role() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Automatic profile creation. Least privilege: a new auth user is a Floor
-- terminal unless the role was set deliberately in metadata. Public sign-up
-- must stay DISABLED in the dashboard (see the setup notes) so that metadata
-- can only originate from you, never from an untrusted client.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role  public.user_role := 'Floor';
  v_floor public.authorized_floor;
  v_raw   text;
  v_name  text;
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
      v_role := 'Floor';
    end;
  end if;

  v_raw := nullif(btrim(coalesce(
             new.raw_app_meta_data  ->> 'assigned_floor',
             new.raw_user_meta_data ->> 'assigned_floor', '')), '');
  if v_raw is not null then
    begin
      v_floor := v_raw::public.authorized_floor;
    exception when others then
      v_floor := null;
    end;
  end if;

  v_name := nullif(btrim(coalesce(
              new.raw_user_meta_data ->> 'full_name',
              new.raw_user_meta_data ->> 'name', '')), '');

  insert into public.profiles (id, full_name, email, user_role, assigned_floor)
  values (
    new.id,
    coalesce(v_name, split_part(lower(new.email), '@', 1)),
    lower(new.email),
    v_role,
    v_floor
  )
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the mirrored email in step when it is changed in the auth dashboard.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
       set email = lower(new.email), updated_at = now()
     where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Privilege-escalation guard. A signed-in user may edit their own display
-- name, nothing else. Role / floor / status / email are admin-only, and the
-- last remaining Admin cannot demote or deactivate themselves.
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    if new.user_role      is distinct from old.user_role
    or new.assigned_floor is distinct from old.assigned_floor
    or new.is_active      is distinct from old.is_active
    or new.email          is distinct from old.email
    or new.id             is distinct from old.id then
      raise exception 'Only administrators can change role, floor, status or email'
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

drop trigger if exists profiles_protect_columns on public.profiles;
create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();
