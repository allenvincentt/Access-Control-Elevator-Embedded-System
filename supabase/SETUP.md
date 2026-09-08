# Elevator System — Supabase setup

Work through this top to bottom. Nothing is assumed to be configured except the
three enums you said you already created (`user_role`, `authorized_floor`,
`active_status`) — and even those are re-created idempotently in `0001`.

---

## 1. SQL to run

Open **Dashboard → SQL Editor → New query** and run each file's contents in
order. They are idempotent, so re-running is safe.

| # | File | What it creates |
| --- | --- | --- |
| 1 | `migrations/0001_extensions_and_enums.sql` | `pgcrypto`, `vector`, `pg_trgm`; the three existing enums (created only if missing); new `access_stage`, `access_decision`, `denial_reason`; `has_unique_elements()` |
| 2 | `migrations/0002_profiles.sql` | `profiles` table, `auth_role()`, `is_admin()`, auto-profile trigger, privilege-escalation guard |
| 3 | `migrations/0003_staff_and_config.sql` | `staff` table + normalising trigger, `app_config` thresholds |
| 4 | `migrations/0004_biometrics_and_logs.sql` | `staff_face_templates` (pgvector), `verification_sessions`, append-only `access_logs` |
| 5 | `migrations/0005_rls_policies.sql` | RLS enable + every policy + least-privilege grants |
| 6 | `migrations/0006_functions_shared.sql` | `log_access()`, `parse_embedding()`, `purge_stale_sessions()` |
| 7 | `migrations/0007_face_enrollment.sql` | `enroll_staff_face()`, `reset_staff_face()` |
| 8 | `migrations/0008_verification.sql` | `verify_company_barcode()`, `verify_staff_face()`, `cancel_verification_session()` |
| 9 | `migrations/0009_dashboard_and_storage.sql` | `admin_dashboard_stats()`, `staff-photos` bucket + storage policies |
| 10 | `migrations/0010_create_staff_with_face.sql` | `create_staff_with_face()` (atomic create + enrol) |
| 11 | `migrations/0011_face_embedding_192.sql` | Widens `staff_face_templates.embedding` to `vector(192)` and sets `embedding_dimensions` to 192. **Deletes every existing face template** — run only on a database created before this change, then re-enrol everyone |
| 12 | `migrations/0012_drop_terminal_model.sql` | Drops the Floor-terminal model: removes `profiles.assigned_floor` and the terminal columns on `verification_sessions` / `access_logs`, adds `device_id` + `face_passed_at`, rebuilds the verification RPCs to run under the **anon** role, and adds `commit_floor_access()` for the floor-choice step |

> If step 9's `create policy ... on storage.objects` fails with a permissions
> error, create the same four policies from **Storage → staff-photos →
> Policies** instead, using `public.is_admin()` as the expression.

### Create your first administrator

Create the user in **Authentication → Users → Add user** (email + password,
tick *Auto Confirm User*). After `0012` the trigger gives every new user the
**Admin** role. There is no other role.

Admins are the only accounts that sign in. Staff verification (barcode → face →
floor choice) runs from **Go to Scanning** on the sign-in screen with no account
at all — the RPCs are granted to the `anon` role.

### Tune the matching thresholds (optional)

```sql
update public.app_config
   set face_match_threshold     = 0.620,  -- cosine similarity to accept
       face_impostor_margin     = 0.040,  -- must beat the nearest stranger by this
       face_duplicate_threshold = 0.780,  -- reject enrolling a face already on file
       face_min_quality         = 0.550,  -- reject blurry / badly lit captures
       face_max_attempts        = 5,      -- face tries per barcode scan
       barcode_session_ttl_seconds = 120
 where id;
```

Raise `face_match_threshold` for fewer false accepts, lower it for fewer false
rejects. Re-measure after any change to the `.tflite` model.

### Useful operational queries

```sql
-- Who has no face template and will be stopped at step 1?
select company_id, full_name, access_status
from public.staff
where face_template_count = 0
order by created_at desc;

-- Recent denials
select occurred_at, stage, reason, scanned_company_id, staff_name_snapshot, floor
from public.access_logs
where decision = 'Denied'
order by occurred_at desc
limit 50;

-- Confirm every table has RLS on
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r';
```

---

## 2. Supabase Dashboard configuration

### Authentication → Sign In / Providers → Email

| Setting | Value | Why |
| --- | --- | --- |
| **Allow new users to sign up** | **OFF** | Critical. Accounts are issued by facilities only. With sign-up open, anyone could create an account, and the role metadata read by `handle_new_user()` would come from an untrusted client. |
| Confirm email | ON | Prevents unverified addresses holding a profile row. |
| Secure email change | ON | Requires confirmation on both addresses. |
| Minimum password length | 12 or more | Terminal accounts are long-lived. |
| Password requirements | Letters, digits, symbols | |
| **Leaked password protection** | ON (Auth → Attack Protection) | Rejects passwords found in breach corpora. |

Leave every OAuth provider **disabled** — this app only uses email + password.

### Authentication → Sessions / Tokens

- Access token (JWT) expiry: **3600 s**.
- Refresh token rotation: **ON**, reuse interval 10 s.
- "Enforce single session per user": optional; useful if each floor terminal
  should only be signed in on one device.

### Authentication → Rate Limits

- Sign-ins / sign-ups per hour per IP: lower it (e.g. 30). This is the only
  brute-force control on the login endpoint; the in-app limits protect
  verification, not authentication.
- Token refreshes: leave at default.

### Authentication → URL Configuration

- Site URL: `elevatorsystemmobileapp://` (the scheme in `app.json`).
- Redirect URLs: add `elevatorsystemmobileapp://*` so password-reset links open
  the app rather than a browser.

### Storage

`0009` creates the bucket, but confirm under **Storage → staff-photos**:

- **Public: OFF** (the app reads through 1-hour signed URLs).
- File size limit: 5 MB.
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`.
- Four policies exist, all gated on `public.is_admin()`.

Face captures are **never** uploaded here. Only admin-chosen profile pictures.

### Database → Extensions

Confirm `vector`, `pgcrypto` and `pg_trgm` are enabled in the `extensions`
schema (step 1 does this).

### API keys

**Settings → API Keys**. Copy the **anon / publishable** key only.
The **service_role / secret** key must never appear in the app, in `.env`, or in
any file that gets bundled — it bypasses every RLS policy in this document.
`src/lib/env.ts` refuses to start if it detects one.

---

## 3. Code changes required on your side

### Environment variables

```bash
cp .env.example .env
```

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...            # or sb_publishable_...
```

`.env` is gitignored. Restart with `npx expo start --clear` after editing it —
`EXPO_PUBLIC_*` values are inlined at build time.

### MobileFaceNet model

`src/assets/models/mobilefacenet.tflite` is a **placeholder**. Replace it with a
real model matching this contract (see `src/assets/models/README.md`):

- input `1 x 112 x 112 x 3` float32 RGB, normalised `(px - 127.5) / 128`
- output `1 x 128` float32

Face enrollment and verification will refuse to run until you do, with an
explicit on-screen message rather than a silent failure.

### Development build

`@react-native-ml-kit/face-detection` and `react-native-fast-tflite` are native
modules. Expo Go cannot load them:

```bash
npx expo run:android
```

Everything except the two camera flows works in Expo Go and on web.

---

## 4. Security model

### Trust boundaries

- **Staff are not auth users.** Only Admins sign in. A stolen badge grants
  nothing on its own — face match is still required.
- **The scanner is unauthenticated.** `verify_company_barcode()`,
  `verify_staff_face()` and `commit_floor_access()` are granted to `anon`. They
  return staff data field-by-field only; the `staff` table itself has no `anon`
  SELECT policy or grant, so the public key cannot enumerate it.
- **Biometric templates are unreachable through the API.** `staff_face_templates`
  and `verification_sessions` have RLS enabled with *zero policies* and *zero
  grants*. Only the `SECURITY DEFINER` functions touch them. Nobody — not even
  an administrator — can export the templates over PostgREST.
- **Matching happens on the server.** The device computes a 128-d embedding and
  sends it; the comparison never leaves Postgres. A compromised terminal cannot
  download everyone's biometric templates.

### Privilege escalation

- `handle_new_user()` defaults new users to **Admin** (the only role). Sign-up
  is disabled, so accounts can only come from you.
- `protect_profile_columns()` blocks a non-admin from changing their own
  `user_role`, `is_active` or `email`, even though the RLS policy lets them
  update their own row.
- The last active administrator cannot demote or deactivate themselves.

### Two-stage binding and replay

- A successful barcode scan mints a random 256-bit token; only its SHA-256 hash
  is stored. Stage 2 will not run without it, so the flow cannot skip the badge
  check or replay an old success.
- Sessions are single-use (`consumed_at` set with a conditional `UPDATE ...
  RETURNING`, so two concurrent requests cannot both win), expire in 120 s
  (covering barcode → face → floor choice), and allow at most 5 face attempts.
  Face match sets `face_passed_at` but does **not** consume the session;
  `commit_floor_access()` consumes it and logs the grant with the chosen floor.
- Authorisation is **re-checked at every stage** (`Suspended`, face templates
  present, and the chosen floor in `authorized_floors`). Suspending someone
  mid-flow denies them even if their badge and face already passed.

### Anti-spoofing and accuracy

- Detection gates before any embedding is computed: exactly one face, minimum
  face size, centring, yaw/pitch/roll limits, eyes open, mean luminance range,
  luminance spread, and variance-of-Laplacian sharpness.
- Enrollment takes 3 captures and rejects the set if any pair disagrees, which
  catches "two different people photographed in one session".
- Enrollment rejects a face already enrolled to someone else (duplicate check
  against every other template).
- Verification requires both `similarity >= threshold` **and** that the badge
  holder is nearer than the closest stranger by `face_impostor_margin`.
- `parse_embedding()` rejects wrong dimensionality, non-finite values, and
  vectors that are not L2-normalised, so the matcher cannot be fed a crafted
  vector that trivially satisfies the threshold.

### Rate limiting and audit

- Per-device: 20 denials in 60 s locks that install out (`device_id` is a UUID
  the app stores in `expo-secure-store`). This is best-effort — the id can be
  reset by reinstalling or spoofed per request — so it is only the accidental-
  abuse layer.
- Per-badge: 10 denials in 15 minutes locks that Company ID out. This is the
  identity-anchored layer and cannot be reset by an attacker.
- Every outcome — granted and denied, every stage — is written to `access_logs`
  by a `SECURITY DEFINER` function. No role has an INSERT grant, so a caller can
  neither forge nor suppress an entry, and an `access_logs` trigger blocks
  UPDATE and DELETE for everyone.
- `staff_id` is `ON DELETE SET NULL` with name/ID snapshots, so deleting a staff
  member never erases their history.

### Input validation

Validated in three places: the form, the service layer, and the database.
`company_id` (`^[A-Z0-9][A-Z0-9-]{2,31}$`), email format, floor-array
cardinality and uniqueness, `photo_path` shape, and quality bounds are all
CHECK constraints — a bug in one client cannot corrupt the data.

`updateStaff()` writes an explicit whitelist of columns (mass-assignment
prevention), and the staff trigger refuses client writes to `face_enrolled_at`
and `face_template_count` — those are owned by `enroll_staff_face()`.

### Known gaps (deliberate, worth knowing)

- **No liveness detection.** The quality gates reject blurry, dark, turned and
  eyes-closed frames, but a high-quality printed photo or a phone screen held up
  to the camera can still pass. Real presentation-attack detection needs a
  dedicated model or depth/IR hardware. Until then the barcode is the second
  factor, and every attempt is logged.
- **Profile pictures are validated client-side only.** The bucket enforces size
  and MIME type; true magic-byte inspection would need an Edge Function on
  upload.
- Supabase's default privileges grant `anon`/`authenticated` access to *new*
  tables. `0005` revokes those for the current tables — re-run the revoke block
  after adding any table.
- **The verification RPCs are callable by anyone with the public anon key.**
  They are hardened (input allowlist, per-badge lockout, single-use tokens,
  server-side matching, no table reads) but an attacker can still submit
  guesses. The per-badge lockout and the audit log are the controls; lower the
  Supabase **Auth → Rate Limits** and consider an edge proxy if abuse appears.
