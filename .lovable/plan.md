## 1. Fix face recognition on >5MB images

**Root cause**: AWS Rekognition's `IndexFaces` with inline `Bytes` is hard-capped at **5MB**. Today `processPhoto.ts` sees a >5MB image and marks it `processing_error: "Too large for face recognition"` instead of processing it.

**Approach**: Shrink large images **client-side during upload** (best UX, no extra storage, no extra Rekognition cost). We already have a canvas-based downscaler used for HEIC — extend it to all images.

- In `src/lib/imageUtils.ts`, lower the threshold and tighten the canvas resize: any JPEG/PNG/WebP over ~4.5MB or with a long edge over ~2200px gets re-encoded as JPEG quality ~0.85, max long edge 2200px. Videos untouched.
- Wire it into both upload entry points:
  - `EventAdmin.tsx` upload flow (admin / photographer)
  - The new guest upload flow below
- The 5MB safety check in `supabase/functions/_shared/processPhoto.ts` stays as a backstop, but in practice no photo should hit it anymore. We do **not** switch Rekognition to the S3-reference variant (would require extra IAM + bucket policy work and doesn't help quality).

Trade-off to flag: originals are replaced by the 2200px JPEG before upload — guests/photographers won't get full-resolution downloads back. If you want to keep originals, we'd need a second "processing copy" path (more storage + a second S3 PUT per file). I'd recommend starting with the simple replace; we can add originals later if needed.

## 2. Let guests upload photos from the album page

Add a "Contribute photos" action on `EventPublic.tsx` (and `Album.tsx`) so any guest on a phone can shoot/select photos and add them to the event album.

- New button group on the album page, mobile-first:
  - "Take photo" — `<input type="file" accept="image/*" capture="environment" multiple>`
  - "Choose from gallery" — `<input type="file" accept="image/*,video/*" multiple>`
- Optional small name field ("Your name") so the host can see who contributed; stored in `photos.uploaded_by`. Stored locally per event in `localStorage`.
- Files run through the same shrink + HEIC pipeline, then uploaded to S3 via a new **guest-scoped** edge function.
- After upload, photos are queued for face processing the same way admin uploads are (`process-photos`).
- Uploaded photos get `source_label = "Guest uploads"` (or `Guest: <name>` if a name is given) so the admin can find/manage them inside the existing Folders UI in the admin panel.
- Admin gating: respect a new event flag `allow_guest_uploads` (default **on** for now per your request — we can expose a toggle in EventAdmin → Settings). If off, the buttons are hidden and the function rejects.

### Technical details

- New edge function `guest-sign-s3-upload` (verify_jwt = false). Mirrors `sign-s3-upload` but:
  - Takes `eventSlug` instead of `eventId`, looks up the event, checks `allow_guest_uploads`.
  - Forces `source = "guest_upload"` and `source_label` to `Guest uploads` / `Guest: <name>`.
  - No host check.
- New migration: add `events.allow_guest_uploads boolean not null default true`.
- After successful PUTs, guest client calls existing `process-photos` (already public/JWT-optional) with the returned photo IDs to kick off face matching.
- `EventAdmin.tsx`:
  - Add a Settings toggle "Allow guests to upload photos".
  - The "Guest uploads" folder shows up automatically in the existing folders sidebar.

### Files to edit / create
- Edit: `src/lib/imageUtils.ts` (general downscale helper), `src/pages/EventAdmin.tsx` (use it; settings toggle), `src/pages/EventPublic.tsx` and/or `src/pages/Album.tsx` (guest upload UI), `src/integrations/supabase/types.ts` (auto), `supabase/config.toml` (register new function).
- Create: `supabase/functions/guest-sign-s3-upload/index.ts`, migration adding `allow_guest_uploads`.

### Out of scope
- Keeping full-resolution originals alongside a processing copy.
- Per-guest rate limiting / abuse controls beyond the existing event scoping.
