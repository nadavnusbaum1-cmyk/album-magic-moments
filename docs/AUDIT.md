# Cheez AI — Technical Audit (Phase 1, as-built)

_Date: 2026-08-11 · Scope: full audit of the existing `album-magic-moments` codebase before any production refactor._

---

## 0. Executive summary & verdict

This is **not a throwaway prototype**. It is a genuinely functional, reasonably sophisticated event-photo app with a working AWS Rekognition pipeline, per-event face collections, face clustering ("people"), a selfie→personal-album flow, guest uploads, EXIF-based chronological sorting, HEIC handling, i18n (EN/HE with RTL), and a broad admin surface. Much of what the brief asks for **already exists in some form**.

**Verdict: refactor in place, do not rebuild.** The core flows work and the AWS integration is real. The gaps are concentrated in exactly the areas the brief cares most about: **DB↔storage↔Rekognition consistency, a real upload state machine, deletion cleanup, image derivatives (thumbnails), object-level authorization, and operational hardening (reconciliation, monitoring, environments).** These are additive/surgical changes, not a new codebase.

### Stack, as actually built (vs. the brief's assumptions)
| Layer | Brief assumed | Reality |
|---|---|---|
| Frontend | (generic) | Vite + React 18 + TS + shadcn/ui + Tailwind, React Router v6 |
| Backend | (generic) | **Supabase** (Lovable Cloud): Postgres + Supabase Auth + **30 Deno Edge Functions** |
| Object storage | AWS S3 | **AWS S3** (real) — but via a **third-party "connector gateway"** (`connector-gateway.lovable.dev`) for presign, and **direct SigV4** for delete |
| Face recognition | AWS Rekognition | **AWS Rekognition** (real, hand-rolled SigV4, no AWS SDK), **one collection per event** |
| Extras present | — | Face **clustering/people**, EXIF (`exifr`), HEIC convert, client ZIP (`jszip`), i18n+RTL, WhatsApp (Twilio, out-of-scope) |

---

## 1. Data model (Postgres)

**Tables:** `profiles`, `user_roles` (enum `app_role = super_admin|host`), `events`, `event_members`, `photos`, `guests`, `photo_matches`, `face_clusters`, `cluster_photo_matches`. Buckets: `selfies` (private), `event-photos` (**public**, covers only). Extensions: `pg_cron`, `pg_net`.

**Hierarchy:**
```
auth.users → events (owner_id) → { photos, guests, face_clusters }
  photos ── photo_matches ──> guests            (guest-centric matching, original MVP)
  photos ── cluster_photo_matches ──> face_clusters (cluster-centric, added day 2)
  guests.cluster_id ──> face_clusters            (bridge between the two schemes)
  events.cover_photo_id ──> photos               (uuid, NO FK)
  face_clusters.representative_photo_id ──> photos (uuid, NO FK)
```

**Photo state is booleans + free text, not a state machine:** `processed bool`, `processing_error text`, `review_skipped bool`, `face_count int`, `source text` (`'upload'|'guest_upload'|'photographer'`, unconstrained), `media_type text`, `storage_provider text` (`'s3'|'supabase'`), `s3_key`, `storage_path`, `taken_at`, `sort_at` (generated `COALESCE(taken_at, created_at)`). **No status enum, no CHECK constraints, no `updated_at` on photos, no visibility/moderation column.**

**Storage keys:** only the **original** is tracked (`s3_key` / `storage_path`). **No thumbnail or medium key columns exist anywhere.**

### Schema smells / churn
1. **Migration 11 (`20260502145605`) unconditionally `DELETE`s all five media tables** — a destructive wipe embedded in history.
2. RLS policy flip-flops: fully-open `USING (true)` write policy on clusters added then dropped a day later; media tables were world-readable then locked down.
3. Duplicate `UNIQUE (cluster_id, photo_id)` (declared inline **and** as a named constraint).
4. `taken_at`/`sort_at` reworked within a single day (index created then replaced).
5. `event_id` is **nullable on all five child tables**, yet every host RLS policy requires `event_id IS NOT NULL` → any orphan/legacy row with null `event_id` is invisible to the app but still present (and reachable via service role / public bucket).
6. Loose typing: `photos.uploaded_by` is `text` (not a uuid FK); `cover_photo_id` / `representative_photo_id` have no FK.
7. Two parallel matching schemes (`photo_matches` + `cluster_photo_matches`) both live and must be kept in sync.

---

## 2. Storage / S3 lifecycle

**Two separate storage systems** — the root of much complexity:
- **AWS S3** = the real photo store. Keys: `event-photos/{eventId}/{serverUUID}.{ext}` (immutable, server-generated UUID — good, not filename-based). Private bucket, served via 1-hour presigned GET or the `photo-proxy` function. **Presign goes through the Lovable connector gateway** (`LOVABLE_API_KEY` + `AWS_S3_API_KEY`); **delete uses direct AWS SigV4** with `AWS_ACCESS_KEY_ID/SECRET` because "the gateway only proxies GET-list and HEAD."
- **Supabase public bucket `event-photos`** = cover/home-bg images only (`covers/…`, `home-bg/…`), stored as public URLs.

**Upload flow (the critical structural problem):**
1. Client extracts EXIF + shrinks/HEIC-converts, calls `sign-s3-upload` (host, `requireHost`) or `guest-sign-s3-upload` (public, gated by `allow_guest_uploads`).
2. Server presigns PUT URLs **and inserts all `photos` rows in one batch** with `processed:false`.
3. **Client** PUTs bytes to S3, then fires `process-photo-now` (fire-and-forget, `.catch(()=>{})`).

→ **The DB row is created before, and independently of, the S3 PUT. There is no server-side HEAD-after-PUT verification and no upload state machine.** A signed-but-never-uploaded row is indistinguishable from a valid one until processing fails to download it. On mobile flakiness this **guarantees accumulation of ghost rows** whose gallery URL 404s.

**Derivatives:** **none.** Grids, people tiles, and the Lightbox all load the **full-resolution original**. Client-side shrinking exists only to fit Rekognition's 5 MB cap, not to produce a stored thumbnail. This is the biggest read-path performance problem.

**Delete flow (`delete-photos`, host-authed per event):** deletes the single S3 original (404 treated as success), `photo_matches`, `cluster_photo_matches`, `photos`, then recomputes guest/cluster counts and re-points cluster representatives. **But:**
- **Never calls Rekognition `DeleteFaces`** → indexed faces for deleted photos live forever in the collection.
- **No atomicity / no rollback:** if S3 delete fails, DB rows are deleted anyway → **orphaned S3 objects**; still returns success.
- **Cover replacement leaks:** `upload-cover` writes a new timestamped object with `upsert:true` and never deletes the old one.

**Reconciliation:** **none.** The only background job, `process-photos` ("cron safety net"), just retries face processing of `processed:false` rows — it never checks object existence, never repairs counts, never deletes orphans. **No `cron.schedule` exists in any migration**, so even that safety net depends on an out-of-repo dashboard schedule; if unset, failed uploads are never retried.

**Idempotency:** uploads are **not** idempotent — retry/refresh re-signs new UUIDs → duplicate rows + objects. `process-photo-now` guards on `processed`, and clusters upsert, but `photo_matches` insert has **no conflict guard** and blindly increments `guests.photo_count` → reprocessing can double-count.

---

## 3. Rekognition & processing pipeline

- **One collection per event** (`event-{eventId}`), created lazily, isolating faces per tenant. Face records distinguished by `ExternalImageId`: `photo-<id>` (photo faces) and raw `<guestId>` (selfies).
- **APIs used:** `CreateCollection`, `IndexFaces` (photos `MaxFaces:20`; selfies `MaxFaces:1`), `SearchFaces`, `SearchFacesByImage` (selfie, threshold 75, `MaxFaces:4096`), `DeleteCollection` (only in `reprocess-event mode:all`). **`DeleteFaces` is never called.**
- **Processing = face indexing + guest/cluster matching only.** EXIF is client-side; no server thumbnailing. `>5 MB` images are skipped for face recognition (marked processed with an error) but the object is already stored.
- **Selfie flow** (`register-guest`, public by slug): index selfie → dual search (`SearchFacesByImage` + `SearchFaces`) → resolve to photo candidates + expand matching clusters (≥85) into all their photos → upsert `photo_matches` → return `magic_token`. Searches the **whole collection**, so personal albums include guest-uploaded photos too (no `source` filter).
- **Clustering:** automatic single-link per photo (threshold 80) + host-callable bulk `auto-merge-clusters` (strict 90) + manual merge/rename/hide. Auto-merge is **not** triggered by the pipeline; it must be invoked from the UI.

### Processing failure/consistency risks
1. **`processing_error` permanently excludes a photo from the cron sweep** (`process-photos` filters `processing_error IS NULL`) → a transient S3/Rekognition blip becomes a permanent stall needing manual reprocess.
2. **Guest uploads can't be processed inline** — `process-photo-now` is host-only, so a guest's call returns 403 (swallowed); guest photos depend entirely on the (unscheduled) cron.
3. **Duplicate indexing on retry** — `IndexFaces` isn't idempotent; a crash between index and `processed:true`, or a manual reindex, adds duplicate faces + can inflate `photo_count`.
4. **No cleanup on delete** — faces + whole collections leak (see §2).

### Key thresholds
`MATCH_THRESHOLD` 80 · `CLUSTER_THRESHOLD` 80 · per-face `SearchFaces` 70 · register-guest match 75, cluster-expansion 85 · auto-merge 90 · Rekognition size cap 5 MB · cron batch 10 · reprocess concurrency 6.

---

## 4. Frontend, auth & UX

**Routes:** `/` (redirect only, no marketing) · `/auth` (host) · `/dashboard`, `/dashboard/event/:id` (host, protected) · `/e/:slug` (public event) · `/album/:token` (personal album) · `/person/:id` (face cluster).

**Auth:** organizers via **Supabase Auth** (email/password + Google through the Lovable OAuth wrapper → ends as a Supabase session). Frontend guards are **redirect-only (cosmetic)**; the real gate is server-side `requireHost` → `is_event_host` RPC on host functions. **Guests have no login** — the selfie flow mints an unguessable `magic_token` UUID (`/album/:token`), a proper capability URL.

**The three experiences:**
- **(a) Official album — EXISTS** (gated by `show_all_photos`).
- **(b) Selfie → "My Photos" — EXISTS** (full backend flow).
- **(c) Guest uploads — CONTRIBUTION EXISTS, but no dedicated guest gallery.** Guest photos land in the same `photos` pool (`source:'guest_upload'`) and surface only through All-photos/people. There is **no guest-only album view** and **no moderation queue** — guest photos go live immediately; the only control is the global `allow_guest_uploads` toggle. (The admin "Review" tab is *face-detection* review, not upload approval.)

**Gallery/viewer:** CSS grid, native `loading="lazy"`, cursor "Load more" (no infinite scroll), a capable Lightbox (keyboard/swipe/preload/download). All load **full-size originals** (no medium/thumb).

**Analytics: none** (no GA/PostHog/etc.; only `console.*`). The brief's entire analytics section is greenfield.

**Prototype smells:** full-size images everywhere; unauthenticated `photo-proxy`/`cluster-photos`; auto-generated guest name `Guest-<base36>` greeting despite a real name field; WhatsApp share requires the host to paste their own Twilio sandbox number (dev setup leaking to users); TanStack Query installed but unused; native `confirm()`/`alert()` for destructive actions; raw backend error strings shown to users; `list-events` N+1 counts; EventAdmin is one ~1100-line component.

---

## 5. Security findings (ranked)

| # | Severity | Finding |
|---|---|---|
| 1 | **High** | **`photo-proxy` is an unauthenticated open image proxy** — `?id=<uuid>` streams any photo; also accepts an arbitrary `?url=` gated only by a host allow-list (`*.amazonaws.com` / Supabase host). No per-viewer/event authorization. |
| 2 | **High** | **Supabase `event-photos` bucket is `public=true`.** Covers live there today, but the public policy + naming collision is a cross-tenant footgun; anything written there is world-readable by URL. |
| 3 | **High** | **No object-level authz on people/photos.** `/person/:id` (`cluster-photos`) and `list-clusters` are fully public for any published event → anyone with the link can enumerate & browse **everyone's** face folders. Privacy model needs an explicit decision. |
| 4 | **Med** | **No byte-size limit** on the main photo/video presigned uploads (only file *count* 30/batch for guests + client-side shrink a malicious client can skip). |
| 5 | **Med** | **`process-photos` has no auth** and runs with service-role privileges → any anon caller can trigger Rekognition spend. |
| 6 | **Med** | **All edge functions use the service-role client (bypass RLS);** tenant isolation for media tables is enforced *only* in code. One missing `event_id` filter = cross-event disclosure with no DB backstop. |
| 7 | **Med** | Content-type validation is **soft** (server silently coerces a bad `contentType` to `image/jpeg` instead of rejecting). No content/magic-byte validation. |
| 8 | **Low** | `profiles` is world-readable (`USING (true)`); published `events` expose `owner_id` + are anon-enumerable (`is_published` defaults true). |
| 9 | **Low** | `.env` committed (anon key only — browser-safe, but not gitignored). Selfies persisted to a bucket while UI implies they aren't stored. |

---

## 6. DB ↔ S3 ↔ Rekognition consistency register

The brief's central concern. Concrete divergence scenarios that exist today:

| Scenario | Cause | Current outcome |
|---|---|---|
| DB row, no S3 object | Row inserted at sign-time; client PUT fails/abandoned | Permanent ghost row; gallery URL 404s; excluded from cron after first error |
| S3 object, no DB row | `delete-photos` proceeds even if S3 delete fails | Orphaned object, no reference, no cleanup |
| Rekognition face, no photo | `DeleteFaces` never called | Stale faces pollute search/merge forever |
| Rekognition collection, no event | No `delete-event`; `DeleteCollection` only on full reprocess | Collections + selfies leak per deleted event |
| Duplicate object + row | Non-idempotent re-sign on retry | Duplicate photos + objects |
| Orphaned cover objects | `upload-cover` never deletes old cover | Public bucket accumulates old covers |
| Drifted `photo_count` | Non-transactional match insert + counter increment | Guest counts can diverge from actual matches |
| **No reconciliation** | No DB↔S3 job; cron unscheduled in repo | Divergences are never detected or repaired |

---

## 7. Gap analysis vs. the Phase-1 brief

| Capability | Status |
|---|---|
| Organizer accounts, event mgmt, public event pages | ✅ Exists |
| QR-code access | ⚠️ Public slug link exists; QR generation not confirmed in UI |
| Official photo upload, personal albums, selfie/face match | ✅ Exists |
| General event album, photo viewer, downloads (incl. ZIP) | ✅ Exists |
| Guest photo **upload** | ✅ Exists (contribution) |
| Guest photo **album (distinct view)** | ❌ Missing |
| Guest photo **moderation** (pending/approve/reject) | ❌ Missing |
| Album sharing | ⚠️ Partial (download/share; WhatsApp is BYO-Twilio) |
| Thumbnails / medium renditions | ❌ Missing (originals everywhere) |
| Upload state machine | ❌ Missing (booleans only) |
| Delete → full cleanup (S3 + Rekognition) | ❌ Partial (no `DeleteFaces`, no atomicity) |
| Reconciliation / orphan detection | ❌ Missing |
| Analytics | ❌ Missing |
| Production monitoring / observability | ❌ Missing (console only) |
| Encryption at rest, lifecycle rules, dev/staging/prod split | ❌ Not evidenced |
| Object-level authorization | ❌ Weak (unlisted-URL security) |
| Automated tests for storage lifecycle | ❌ Missing (only a sample test) |
| Out of scope (correctly absent from Phase 1): WhatsApp, native apps, video editing | `send-whatsapp` present as legacy leftover |

---

## 8. Recommended production architecture (deltas, not a rewrite)

Keep the working infrastructure (Supabase + Edge Functions + AWS S3/Rekognition). Apply these targeted changes:

1. **Introduce a real photo state machine** — add `upload_status` (`pending|uploaded|processing|ready|failed|deleting|deleted`) and a `visibility`/`moderation_status` column; drive the UI off it; stop overloading `processed`.
2. **Verify uploads server-side** — add a `confirm-upload` step (HEAD the object) that transitions `pending→uploaded`; sweep un-confirmed `pending` rows.
3. **Generate derivatives** — thumbnail + medium on process (or on-the-fly transform), store `s3_key_thumb`/`s3_key_medium`; never load originals into grids.
4. **Make delete complete & safe** — soft-delete (`deleted_at`) → background hard-delete that removes original+thumb+medium **and** calls Rekognition `DeleteFaces`, with retries; add `delete-event` that `DeleteCollection`s.
5. **Reconciliation job** — scheduled DB→S3 (missing object → mark broken) and S3→DB (orphan → report) sweeps; schedule the existing `process-photos` net in-repo.
6. **Fix processing durability** — separate "retryable error" from "permanent skip"; make guest uploads processable (a guest-safe processing trigger); guard `photo_matches` inserts against double-count.
7. **Lock down authorization** — put a token/scope on `photo-proxy` and `cluster-photos`; add byte-size limits + magic-byte validation to uploads; decide the people-gallery privacy model.
8. **Idempotency** — client-supplied idempotency key so retries reuse the same photo id/key.
9. **Operational** — SSE-S3/KMS encryption, S3 lifecycle rules (temp ZIPs, deleted objects), structured logging with event/photo/guest ids, analytics event stream, dev/staging/prod prefixes + collections.
10. **Product gaps** — dedicated Guest Photos album view; guest moderation queue (`allow_guest_uploads` auto-publish flag already exists to build on).

---

## 9. Open decisions (block the build)

1. **Connector gateway vs. direct AWS.** Presign currently depends on `connector-gateway.lovable.dev` (a Lovable-managed proxy holding AWS keys). For production the brief implies **your own IAM + least privilege**. Keep the gateway (faster, less control) or move presign to direct SigV4/AWS SDK with your own creds?
2. **Hosting/infra.** Stay on Supabase/Lovable Cloud (recommended — don't replace working infra) and formalize dev/staging/prod, or migrate off?
3. **People-gallery privacy.** Is public face-folder browsing an intended feature or a privacy bug to lock behind the selfie/token?
4. **Where to start.** Brief's Step 3 (storage foundation & consistency) is the riskiest, least-visible work — recommend starting there before UI polish.
