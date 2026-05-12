# Save downloads to phone gallery on mobile

## Problem
Today on mobile:
- Single photo download (`downloadOne`) already tries the Web Share API, which lets iOS/Android users save into Photos. Good.
- "Download all" (`downloadManyAsZip`) always builds a `.zip` and triggers an `<a download>`. On phones, zips land in Files/Downloads, not the Photos gallery, and many users can't extract them.

## Goal
On mobile, photo downloads should land in the phone's gallery (Photos on iOS, Gallery/Downloads-with-MediaStore on Android), not as a zip in Files.

## Approach

Add a mobile-aware "save many" helper and use it from the two places that bulk-download today (`Album.tsx` "Download all" and `EventAdmin.tsx` "Download {n}" / "Download all").

### New helper: `saveManyToGallery` in `src/lib/download.ts`
Behavior:
1. Detect mobile (reuse existing `isMobile()`).
2. Desktop: keep current behavior — call `downloadManyAsZip` (one zip file).
3. Mobile with Web Share API supporting multiple files (`navigator.canShare({ files: [...] })`):
   - Fetch all photos as `File` objects (with proper `image/jpeg` mime + filenames so iOS routes them to Photos).
   - Call `navigator.share({ files })` once. iOS share sheet → "Save N Images" stores them in Photos.
   - Report progress through the same `(done, total)` callback.
4. Mobile without multi-file share (older Android Chrome, in-app browsers):
   - Fall back to sequential `downloadOne(url, name)` calls (already gallery-friendly via single-file share / MediaStore on Android Chrome). Small delay between items so the browser doesn't drop them.
   - If even that is unavailable, fall back to the zip path with a toast explaining the zip.

### Wire-up
- `src/pages/Album.tsx`: replace `downloadManyAsZip(...)` call in `downloadAll` with `saveManyToGallery(...)`. Keep the existing `zipping` progress state; rename label to "Preparing {done}/{total}…" (already generic).
- `src/pages/EventAdmin.tsx`: replace both bulk-download call sites ("Download {n}" selected and "Download all") with `saveManyToGallery`. Keep the existing `zipping` progress state.
- Single-photo download buttons: no change — `downloadOne` already does the right thing on mobile.

### UX notes
- On iOS the share sheet is the only path to Photos; that's expected and acceptable.
- Show a toast after success: "Saved to your gallery" on mobile, "Download ready" on desktop (branch on `isMobile()`).
- Cap mobile multi-share batch size (e.g. 50 files) to stay within iOS share-sheet limits; if more, share in sequential batches and surface progress.

## Files touched
- `src/lib/download.ts` — add `saveManyToGallery`, keep existing exports.
- `src/pages/Album.tsx` — swap bulk download call + success toast.
- `src/pages/EventAdmin.tsx` — swap both bulk download calls + success toast.

No backend, schema, or edge-function changes.
