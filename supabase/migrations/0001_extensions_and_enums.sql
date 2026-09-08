-- =============================================================================
-- 0001  Extensions and enum types
-- =============================================================================
-- Safe to re-run. Creates only what is missing, so it will not clash with the
-- user_role / authorized_floor / active_status enums you already created.

create extension if not exists pgcrypto  with schema extensions;
create extension if not exists vector    with schema extensions;
create extension if not exists pg_trgm   with schema extensions;

-- ---------------------------------------------------------------- user_role
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'user_role' and n.nspname = 'public'
  ) then
    create type public.user_role as enum ('Admin', 'Floor');
  end if;
end $$;

alter type public.user_role add value if not exists 'Admin';
alter type public.user_role add value if not exists 'Floor';

-- --------------------------------------------------------- authorized_floor
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'authorized_floor' and n.nspname = 'public'
  ) then
    create type public.authorized_floor as enum ('MainLobby', 'SecondFloor', 'ThirdFloor');
  end if;
end $$;

alter type public.authorized_floor add value if not exists 'MainLobby';
alter type public.authorized_floor add value if not exists 'SecondFloor';
alter type public.authorized_floor add value if not exists 'ThirdFloor';

-- ------------------------------------------------------------ active_status
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'active_status' and n.nspname = 'public'
  ) then
    create type public.active_status as enum ('Active', 'Suspended');
  end if;
end $$;

alter type public.active_status add value if not exists 'Active';
alter type public.active_status add value if not exists 'Suspended';

-- ----------------------------------------------------- access log vocabulary
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'access_stage' and n.nspname = 'public'
  ) then
    create type public.access_stage as enum ('Barcode', 'Face');
  end if;

  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'access_decision' and n.nspname = 'public'
  ) then
    create type public.access_decision as enum ('Granted', 'Denied');
  end if;

  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'denial_reason' and n.nspname = 'public'
  ) then
    create type public.denial_reason as enum (
      'UnknownCompanyId',
      'Suspended',
      'FloorNotAuthorized',
      'NoFaceEnrolled',
      'FaceMismatch',
      'LowQuality',
      'SessionExpired',
      'TooManyAttempts',
      'RateLimited',
      'TerminalNotConfigured',
      'NotAuthorized',
      'InvalidInput'
    );
  end if;
end $$;

-- Helper used by CHECK constraints: rejects duplicate floors in an array.
create or replace function public.has_unique_elements(arr public.authorized_floor[])
returns boolean
language sql
immutable
parallel safe
as $$
  select arr is null
      or cardinality(arr) = (select count(distinct e) from unnest(arr) e);
$$;
