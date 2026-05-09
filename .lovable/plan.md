# Plan: Folders, Performance & Review Tab

## 1. Folders (sources) in Admin Upload

Reuse existing `source_label` field as "folder". Improve UX:
- Add a **Folders** sidebar/selector in `EventAdmin` Photos tab listing existing source labels + counts + "All".
- When uploading, require a folder selection (dropdown of existing + "New folder…" input). Persist last-used per event in localStorage.
- Filter grid by selected folder (already supported by `admin-list-photos` via `sourceLabel`).
- Add rename/delete-folder actions (bulk update photos' `source_label`, or delete all photos in folder).

New edge function: `rename-source` (host-only) that updates `source_label` across event photos.

## 2. Front Page: hide full album behind a button

In `EventPublic` / `Album` (guest-facing front album page):
- After guest registers and sees "By person" section, show a CTA button **"View full album"** that routes to a separate `/e/:slug/all` view (or toggles state to load via `list-photos` with pagination).
- Don't auto-fetch all photos on the landing page. Only load the matched-person previews + the cover.

## 3. Performance improvements

- **DB indexes** (migration) on hot paths:
  - `photos(event_id, created_at desc)`
  - `photos(event_id, processed)`
  - `photos(event_id, source_label)`
  - `photo_matches(event_id, guest_id)`
  - `cluster_photo_matches(event_id, cluster_id)`
- **Skip `count(*) exact`** in `admin-list-photos` totals (slow on big tables) — use estimated counts via `head:true, count:'planned'` or drop totals from first page and compute lazily in a separate small endpoint.
- **Drop `sources` scan** of 1000 rows on every first page — cache in a small RPC `get_event_sources(event_id)` using `SELECT DISTINCT`.
- Album list: lower default `limit` and rely on cursor pagination already in place.
- Use signed URL caching: increase TTL on `resolvePhotoUrl` (already used) — verify.

## 4. Review tab (un-indexed photos)

New tab in `EventAdmin` → **Review**:
- Lists photos where `processed = true AND face_count = 0` (no person detected) plus `processing_error IS NOT NULL` (failed).
- Per-photo actions:
  - **Re-run indexing** → calls `process-photo-now` for that single photo.
  - **Delete** → existing `delete-photos`.
  - **Bulk re-run** for all in tab.
- New edge function `list-review-photos` (host-only) returning paginated list of those photos.

## Technical notes

- Files to edit:
  - `src/pages/EventAdmin.tsx` — folder UI, review tab.
  - `src/pages/EventPublic.tsx` / `src/pages/Album.tsx` — gate full album behind button + new route.
  - `src/App.tsx` — route for full album page if separate.
  - `supabase/functions/admin-list-photos/index.ts` — drop expensive count, move sources fetch.
  - New: `supabase/functions/list-review-photos/index.ts`, `supabase/functions/rename-source/index.ts`, `supabase/functions/get-event-sources/index.ts`.
- Migration: indexes only (no schema change).
- No new dependencies.