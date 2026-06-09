## Goal
Display photos in chronological order by their actual capture time (EXIF `DateTimeOriginal`), oldest first, across the full event album, personal selfie album, person/cluster album, and the admin gallery. Fall back to upload time when EXIF is missing (e.g. screenshots, videos, edited images).

## Approach

### 1. New column on `photos`
- Add `taken_at timestamptz NULL` to `public.photos` + index on `(event_id, COALESCE(taken_at, created_at))`.
- All ordering uses `COALESCE(taken_at, created_at)` so missing-EXIF items still get a stable position (by upload time).

### 2. Capture EXIF on upload (new photos)
- Add `exifr` (tiny client-side EXIF parser) and extract `DateTimeOriginal` in the browser before upload, in both flows:
  - Admin upload in `src/pages/EventAdmin.tsx`
  - Guest upload in `src/pages/EventPublic.tsx`
- Pass `takenAt` (ISO string, optional) per file to the existing sign endpoints:
  - `supabase/functions/sign-s3-upload/index.ts`
  - `supabase/functions/guest-sign-s3-upload/index.ts`
- Persist into `photos.taken_at` when the row is inserted.
- HEIC files: extract EXIF from the original before HEIC→JPEG conversion (the conversion strips it). Videos: leave `taken_at` null and fall back to upload time.

### 3. Backfill existing photos
- New edge function `backfill-taken-at` (admin only, per-event). It streams photos in batches, fetches the first ~256 KB of each image from S3 (range request), parses EXIF with `exifr`, and updates `taken_at`.
- Trigger from a button in EventAdmin → Settings tab ("Re-detect capture dates"), with progress and a toast on completion. Safe to re-run (skips rows that already have `taken_at`).

### 4. Switch ordering everywhere to ASC by capture date
Update these reads to order by `COALESCE(taken_at, created_at) ASC` and flip pagination cursors from `lt` to `gt`:
- `supabase/functions/list-photos/index.ts` (public full album)
- `supabase/functions/get-album/index.ts` (personal selfie album)
- `supabase/functions/cluster-photos/index.ts` (person/cluster album)
- `supabase/functions/admin-list-photos/index.ts` (admin gallery)
- Cursor format becomes `after` (ISO timestamp) instead of `before`; clients (`Album.tsx`, `EventPublic.tsx`, `EventAdmin.tsx`, `Person.tsx`) updated accordingly. Lightbox order follows the same array, so it stays consistent.

### 5. Admin gallery
- Default sort: chronological ASC. Keep folder filter and totals unchanged.

## Out of scope
- Re-ordering already-shared selfie album links isn't an issue — order is computed at read time, so existing tokens automatically benefit.
- No new UI toggle to switch between "upload time" and "capture time". Capture time is the new default everywhere (with upload-time fallback) per the answers.

## Files touched
- Migration: add `photos.taken_at` + index.
- New edge function: `supabase/functions/backfill-taken-at/index.ts` (+ `supabase/config.toml` entry, public=false).
- Edited edge functions: `sign-s3-upload`, `guest-sign-s3-upload`, `_shared/processPhoto.ts` (insert path), `list-photos`, `get-album`, `cluster-photos`, `admin-list-photos`.
- Frontend: `src/pages/EventAdmin.tsx`, `src/pages/EventPublic.tsx`, `src/pages/Album.tsx`, `src/pages/Person.tsx`, plus a small `src/lib/exif.ts` helper using `exifr`.
- i18n: add `redetect_capture_dates`, `redetect_running`, `redetect_done` keys (he/en).
