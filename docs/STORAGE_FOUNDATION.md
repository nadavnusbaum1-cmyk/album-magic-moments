# Storage & Consistency Foundation — what changed & how to deploy

This is the Step-3 foundation from the brief: a real photo state machine, direct-AWS
S3 (no connector gateway), server-verified uploads, thumbnail/medium renditions,
safe deletion (S3 + Rekognition), and reconciliation.

## What changed

### Database (migrations — apply in order)
- `20260811120000_storage_consistency_foundation.sql` — photo state machine
  (`upload_status`, `processing_status`, `moderation_status`, `visibility`),
  derivative keys (`s3_key_thumbnail`, `s3_key_medium`), `width/height/file_size`,
  `client_upload_id` (idempotency), `deleted_at`/`updated_at`, event settings
  (`people_gallery_visibility` default **private**, `guest_photos_auto_publish`),
  and a trigger keeping the legacy `processed` flag in sync during transition.
- `20260811130000_reconcile_columns.sql` — `upload_error` column.

Apply (staging first):
```bash
supabase db push
```

### New Edge Functions
- `confirm-upload` — HEAD-verifies an upload landed, advances `pending→uploaded`,
  enforces the real size cap, then processes inline (claimed, time-budgeted).
- `delete-event` — full event teardown (S3 + Rekognition collection + cascade).
- `cleanup-deleted` — cron: retries hard-deletes stuck on S3 failures.
- `reconcile-storage` — DB↔S3 reconciliation (missing objects, stale pending, orphans).

### Rewired functions
- `sign-s3-upload` / `guest-sign-s3-upload` — direct-AWS presign, state machine,
  idempotency, size caps, shared `uploadPlan` (dedup).
- `processPhoto` — direct-AWS download; generates thumbnail + medium; runs
  Rekognition on the **medium** (kills the old 5 MB-original limit); authoritative
  guest counts (no double-count); drives `processing_status`.
- `process-photos` — row-claim (no concurrent double-process) + retry cap
  (transient errors no longer stall forever) + cron-secret gate.
- `process-photo-now` — state-aware, claimed, host-only.
- `delete-photos` — soft-mark → shared safe cleanup (never orphans).
- `storage.ts` / `photo-proxy` / `list-photos` / `admin-list-photos` / `get-album`
  / `cluster-photos` — serve thumb/medium/full; exclude soft-deleted; public
  gallery hides ghosts + unmoderated guest photos.
- `backfill-taken-at` — now direct-AWS (last storage user of the connector gateway).
- Removed dead `_shared/s3Delete.ts` (folded into `_shared/s3.ts`).

## Secrets (Supabase → Edge Functions → Secrets)
Required for direct-AWS:
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (existing) — now also need S3
  Get/Put/Delete/List on `event-photos/*` (see IAM policy shared separately).
- `AWS_REGION`, `AWS_S3_BUCKET`.
- `CRON_SECRET` — **new**: a random string. Gates the cron endpoints.

No longer needed for storage once verified: `LOVABLE_API_KEY`, `AWS_S3_API_KEY`
(still used by the out-of-scope `send-whatsapp`). Remove after confirming uploads work.

## Cron schedules (run once in the Supabase SQL editor)
Secrets are NOT committed to the repo. Replace `<PROJECT_REF>` and `<CRON_SECRET>`
with your values and run:

```sql
-- process the queue every minute
select cron.schedule('process-photos', '* * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/process-photos',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
$$);

-- retry stuck deletions every 5 minutes
select cron.schedule('cleanup-deleted', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/cleanup-deleted',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
$$);
```
Run `reconcile-storage` per event on demand (admin) or on a slower schedule.

## Tests
```bash
deno test --allow-env supabase/functions/tests/storage-foundation.test.ts
```
Covers SigV4 presign correctness, verbose-region parsing, and upload planning
(type/size rejection, unique immutable keys).

## Deploy order
1. `supabase db push` (staging).
2. Set secrets (incl. `CRON_SECRET`) + apply the IAM policy.
3. `supabase functions deploy` (all).
4. Run the cron SQL.
5. Smoke test: upload → confirm → gallery thumbnail → delete → verify S3 + faces gone.
6. Reconcile: `reconcile-storage` for the demo event returns clean.

## Still to do (later foundation/security steps)
- Enforce `people_gallery_visibility` on `/person` + `list-clusters` (column ready).
- Guest-photo moderation UI (queue + approve/reject; `moderation_status` ready).
- Scope `photo-proxy` (still unauthenticated; drop the arbitrary `?url=`).
- Tighten `event_id` to NOT NULL after an orphan cleanup pass.
