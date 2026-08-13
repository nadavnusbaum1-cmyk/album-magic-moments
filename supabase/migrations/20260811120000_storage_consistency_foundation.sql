-- =============================================================================
-- Storage & Consistency Foundation (Step 3.1)
-- Adds a real photo state machine, derivative-image keys, soft-delete, upload
-- idempotency, per-photo moderation/visibility, and event-level privacy settings.
--
-- Design: upload and processing are SEPARATE lifecycles because they fail
-- independently. `upload_status` answers "are the bytes in S3?"; the existing
-- `processed`/`processing_error` overload is replaced by `processing_status`
-- ("did Rekognition + derivatives run?"). The legacy `processed` /
-- `processing_error` columns are KEPT and kept in sync during the code
-- migration; they are dropped in a later migration once all Edge Functions read
-- the new columns.
--
-- Everything here is additive and idempotent (IF NOT EXISTS + guarded backfills).
-- No data is deleted.
-- =============================================================================

-- ---------- Enums -------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.photo_upload_status AS ENUM
    ('pending', 'uploaded', 'failed', 'deleting', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.photo_processing_status AS ENUM
    ('queued', 'processing', 'ready', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.photo_moderation_status AS ENUM
    ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.photo_visibility AS ENUM ('visible', 'hidden');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.people_visibility AS ENUM ('public', 'private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- photos: state machine + metadata + derivatives --------------------
ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS upload_status     public.photo_upload_status     NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processing_status public.photo_processing_status NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS moderation_status public.photo_moderation_status NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS visibility        public.photo_visibility        NOT NULL DEFAULT 'visible',
  -- Derivative object keys (generated during processing). Original stays in s3_key.
  ADD COLUMN IF NOT EXISTS s3_key_thumbnail  text,
  ADD COLUMN IF NOT EXISTS s3_key_medium     text,
  -- File metadata (brief §26), populated during processing.
  ADD COLUMN IF NOT EXISTS mime_type         text,
  ADD COLUMN IF NOT EXISTS file_size         bigint,
  ADD COLUMN IF NOT EXISTS width             integer,
  ADD COLUMN IF NOT EXISTS height            integer,
  -- Upload verification + idempotency.
  ADD COLUMN IF NOT EXISTS upload_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_upload_id  text,
  ADD COLUMN IF NOT EXISTS processing_attempts integer NOT NULL DEFAULT 0,
  -- Soft delete + change tracking.
  ADD COLUMN IF NOT EXISTS deleted_at        timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz NOT NULL DEFAULT now();

-- Backfill state machine from legacy columns for existing rows.
-- Existing rows are already live, so we presume their object is uploaded and
-- their content approved (never retroactively hide guest photos already shown).
UPDATE public.photos SET
  upload_status = 'uploaded',
  upload_confirmed_at = COALESCE(upload_confirmed_at, created_at),
  processing_status = CASE
    WHEN processing_error IS NOT NULL THEN 'failed'::public.photo_processing_status
    WHEN processed = true            THEN 'ready'::public.photo_processing_status
    ELSE 'queued'::public.photo_processing_status
  END,
  mime_type = COALESCE(mime_type, content_type),
  updated_at = COALESCE(updated_at, created_at)
WHERE upload_status = 'pending';   -- only rows not yet touched by this backfill

-- keep-in-sync trigger so writes to the new source of truth also update the
-- legacy `processed` flag that existing Edge Functions still read.
CREATE OR REPLACE FUNCTION public.sync_photo_legacy_flags()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.processed := (NEW.processing_status = 'ready');
  -- Clear stale errors only on the happy path; preserve reasons for failed/skipped.
  IF NEW.processing_status IN ('queued', 'processing', 'ready') THEN
    NEW.processing_error := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS photos_sync_legacy ON public.photos;
CREATE TRIGGER photos_sync_legacy
  BEFORE INSERT OR UPDATE OF processing_status ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.sync_photo_legacy_flags();

-- updated_at maintenance (function already exists from earlier migrations).
DROP TRIGGER IF EXISTS photos_updated ON public.photos;
CREATE TRIGGER photos_updated
  BEFORE UPDATE ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Indexes -----------------------------------------------------------
-- Idempotency: a given client upload maps to at most one photo per event.
CREATE UNIQUE INDEX IF NOT EXISTS photos_event_client_upload_uidx
  ON public.photos (event_id, client_upload_id)
  WHERE client_upload_id IS NOT NULL;

-- Reconciliation / worker sweeps.
CREATE INDEX IF NOT EXISTS photos_upload_status_idx
  ON public.photos (upload_status) WHERE upload_status IN ('pending', 'deleting');
CREATE INDEX IF NOT EXISTS photos_processing_status_idx
  ON public.photos (processing_status) WHERE processing_status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS photos_deleted_at_idx
  ON public.photos (deleted_at) WHERE deleted_at IS NOT NULL;
-- Moderation queue (guest photos awaiting review).
CREATE INDEX IF NOT EXISTS photos_event_moderation_idx
  ON public.photos (event_id, moderation_status) WHERE moderation_status = 'pending';

-- ---------- events: privacy + moderation settings -----------------------------
ALTER TABLE public.events
  -- Hybrid people-gallery privacy (default private per product decision).
  ADD COLUMN IF NOT EXISTS people_gallery_visibility public.people_visibility NOT NULL DEFAULT 'private',
  -- When true, guest uploads publish immediately; when false they enter the
  -- moderation queue as 'pending'.
  ADD COLUMN IF NOT EXISTS guest_photos_auto_publish boolean NOT NULL DEFAULT true;

-- =============================================================================
-- NOT changed here (tracked for later foundation steps):
--   * Legacy `processed` / `processing_error` columns remain until all Edge
--     Functions are migrated to upload_status/processing_status, then dropped.
--   * event_id is still nullable on child tables; tightening to NOT NULL needs
--     an orphan-row cleanup pass first.
--   * The two parallel match schemes (photo_matches / cluster_photo_matches)
--     are left as-is.
-- =============================================================================
