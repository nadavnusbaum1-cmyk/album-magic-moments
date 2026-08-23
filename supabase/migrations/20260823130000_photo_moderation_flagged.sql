-- Automated content moderation for GUEST uploads (untrusted). Guest photos are
-- screened with AWS Rekognition DetectModerationLabels during processing; any
-- photo with explicit/violent content is set to 'flagged' — hidden from the
-- public album and surfaced in the host's moderation queue for review.
--   'flagged'          : auto-detected as potentially unsafe (host reviews)
--   moderation_labels  : the detected labels + confidence (the "why")
--   moderation_checked : true once screened, so a reprocess never re-flags a
--                        photo the host already approved.

ALTER TYPE public.photo_moderation_status ADD VALUE IF NOT EXISTS 'flagged';

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS moderation_labels jsonb,
  ADD COLUMN IF NOT EXISTS moderation_checked boolean NOT NULL DEFAULT false;

-- NOTE: the moderation-queue index lives in the next migration — a new enum
-- value ('flagged') can't be referenced in the same transaction that adds it.
