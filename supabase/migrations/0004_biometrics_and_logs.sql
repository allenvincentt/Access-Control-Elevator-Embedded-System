-- =============================================================================
-- 0004  Face templates, verification sessions, access logs
-- =============================================================================
-- No raw face image is ever stored. Only the 192-dimension MobileFaceNet
-- embedding, which is not invertible back to a photograph.

create table if not exists public.staff_face_templates (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references public.staff (id) on delete cascade,
  embedding     extensions.vector(192) not null,
  model_version text not null default 'mobilefacenet-112x112-192d-v1'
                check (char_length(model_version) between 3 and 64),
  quality       numeric(5,4) not null check (quality between 0 and 1),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists staff_face_templates_staff_idx
  on public.staff_face_templates (staff_id);

comment on table public.staff_face_templates is
  'Biometric templates. RLS is enabled with ZERO policies: unreachable through '
  'PostgREST for any role. Only the SECURITY DEFINER verification functions read it.';

-- Optional: uncomment once you are past a few thousand templates. Exact scan
-- is both faster and more accurate below that size.
-- create index staff_face_templates_ann_idx
--   on public.staff_face_templates
--   using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- A barcode scan opens a short-lived, single-use session. Stage 2 (face) will
-- not run without one, so a compromised terminal cannot skip straight to face
-- matching or replay an old success.
-- ---------------------------------------------------------------------------
create table if not exists public.verification_sessions (
  id                  uuid primary key default gen_random_uuid(),
  token_hash          bytea not null unique,
  staff_id            uuid not null references public.staff (id) on delete cascade,
  terminal_profile_id uuid not null references public.profiles (id) on delete cascade,
  floor               public.authorized_floor not null,
  attempts            smallint not null default 0 check (attempts >= 0),
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  consumed_at         timestamptz,
  check (expires_at > created_at)
);

create index if not exists verification_sessions_expiry_idx
  on public.verification_sessions (expires_at);
create index if not exists verification_sessions_terminal_idx
  on public.verification_sessions (terminal_profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Immutable audit trail of every barcode and face attempt, granted or denied.
-- staff_id is nullable and ON DELETE SET NULL so removing a staff member never
-- erases the history; the snapshot columns keep the log readable afterwards.
-- ---------------------------------------------------------------------------
create table if not exists public.access_logs (
  id                    bigint generated always as identity primary key,
  occurred_at           timestamptz not null default now(),
  stage                 public.access_stage not null,
  decision              public.access_decision not null,
  reason                public.denial_reason,
  staff_id              uuid references public.staff (id) on delete set null,
  scanned_company_id    text not null check (char_length(scanned_company_id) between 1 and 64),
  staff_name_snapshot   text,
  floor                 public.authorized_floor,
  terminal_profile_id   uuid references public.profiles (id) on delete set null,
  terminal_name_snapshot text,
  match_score           numeric(6,5) check (match_score between -1 and 1),
  session_id            uuid,
  check (decision = 'Granted' or reason is not null),
  check (decision = 'Denied'  or reason is null)
);

create index if not exists access_logs_time_idx
  on public.access_logs (occurred_at desc);
create index if not exists access_logs_staff_idx
  on public.access_logs (staff_id, occurred_at desc);
create index if not exists access_logs_company_idx
  on public.access_logs (scanned_company_id, occurred_at desc);
create index if not exists access_logs_decision_idx
  on public.access_logs (decision, occurred_at desc);
create index if not exists access_logs_terminal_idx
  on public.access_logs (terminal_profile_id, occurred_at desc)
  where decision = 'Denied';

-- The audit trail is append-only, including for administrators.
create or replace function public.block_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'access_logs is append-only' using errcode = '42501';
end $$;

drop trigger if exists access_logs_no_update on public.access_logs;
create trigger access_logs_no_update
  before update or delete on public.access_logs
  for each row execute function public.block_log_mutation();
