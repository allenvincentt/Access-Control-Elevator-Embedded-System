-- =============================================================================
-- 0003  staff records + tunable security thresholds
-- =============================================================================

create table if not exists public.staff (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null
                      check (char_length(btrim(full_name)) between 2 and 120),
  -- "Gmail" in the UI; stored lower-cased and format-checked in the database
  -- so a bug in one client cannot write a malformed address.
  email               text not null
                      check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  -- Barcode payload. Normalised to upper case; this is what the scanner matches.
  company_id          text not null
                      check (company_id = upper(company_id)
                             and company_id ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  authorized_floors   public.authorized_floor[] not null
                      default '{}'::public.authorized_floor[]
                      check (cardinality(authorized_floors) between 1 and 8
                             and public.has_unique_elements(authorized_floors)),
  access_status       public.active_status not null default 'Active',
  -- Storage object key inside the private "staff-photos" bucket. Never a URL.
  photo_path          text check (photo_path is null
                                  or photo_path ~ '^staff/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'),
  face_enrolled_at    timestamptz,
  face_template_count smallint not null default 0 check (face_template_count between 0 and 10),
  created_by          uuid references public.profiles (id) on delete set null,
  updated_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  search_text         text generated always as (
                        lower(full_name || ' ' || email || ' ' || company_id)
                      ) stored
);

create unique index if not exists staff_company_id_key on public.staff (company_id);
create unique index if not exists staff_email_key      on public.staff (lower(email));
create index        if not exists staff_status_idx     on public.staff (access_status, created_at desc);
create index        if not exists staff_created_idx    on public.staff (created_at desc);
create index        if not exists staff_search_idx     on public.staff using gin (search_text extensions.gin_trgm_ops);

comment on column public.staff.company_id is
  'Barcode payload. Unique, upper-case. Matched by verify_company_barcode().';

-- Normalise on the way in so the CHECK constraints above can never be tripped
-- by casing, and so a client cannot smuggle whitespace past the unique index.
create or replace function public.normalize_staff()
returns trigger
language plpgsql
as $$
begin
  new.full_name  := btrim(regexp_replace(new.full_name, '\s+', ' ', 'g'));
  new.email      := lower(btrim(new.email));
  new.company_id := upper(btrim(new.company_id));

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    -- Biometric bookkeeping is owned by enroll_staff_face(); a direct UPDATE
    -- from a client must never be able to claim a face is enrolled. That
    -- function opts in with a transaction-local GUC before it writes.
    if coalesce(current_setting('app.biometric_write', true), 'off') <> 'on' then
      new.face_enrolled_at    := old.face_enrolled_at;
      new.face_template_count := old.face_template_count;
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;

drop trigger if exists staff_normalize on public.staff;
create trigger staff_normalize
  before insert or update on public.staff
  for each row execute function public.normalize_staff();

-- =============================================================================
-- Tunable thresholds. Single row, admin-readable only: the matching thresholds
-- are part of the attack surface and are not shipped to the client.
-- =============================================================================
create table if not exists public.app_config (
  id                             boolean primary key default true check (id),
  face_match_threshold           numeric(4,3) not null default 0.620
                                 check (face_match_threshold between 0.300 and 0.990),
  face_impostor_margin           numeric(4,3) not null default 0.040
                                 check (face_impostor_margin between 0.000 and 0.500),
  face_duplicate_threshold       numeric(4,3) not null default 0.780
                                 check (face_duplicate_threshold between 0.300 and 0.990),
  face_min_quality               numeric(4,3) not null default 0.550
                                 check (face_min_quality between 0.000 and 1.000),
  enrollment_consistency_min     numeric(4,3) not null default 0.700
                                 check (enrollment_consistency_min between 0.300 and 0.990),
  face_max_attempts              smallint not null default 5  check (face_max_attempts between 1 and 20),
  barcode_session_ttl_seconds    integer  not null default 120 check (barcode_session_ttl_seconds between 15 and 600),
  terminal_denial_window_seconds integer  not null default 60  check (terminal_denial_window_seconds between 10 and 3600),
  terminal_denial_limit          smallint not null default 20  check (terminal_denial_limit between 1 and 500),
  staff_lockout_window_minutes   integer  not null default 15  check (staff_lockout_window_minutes between 1 and 1440),
  staff_lockout_limit            smallint not null default 10  check (staff_lockout_limit between 1 and 100),
  embedding_dimensions           smallint not null default 192 check (embedding_dimensions in (128, 192, 512)),
  updated_at                     timestamptz not null default now(),
  updated_by                     uuid references public.profiles (id) on delete set null
);

insert into public.app_config (id) values (true) on conflict (id) do nothing;
