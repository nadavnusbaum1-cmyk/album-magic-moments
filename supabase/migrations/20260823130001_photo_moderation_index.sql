-- Host moderation queue lookup (pending manual review + auto-flagged guest
-- uploads). Separate migration so the 'flagged' enum value added in the previous
-- migration is already committed and safe to reference here.
CREATE INDEX IF NOT EXISTS photos_moderation_queue_idx
  ON public.photos (event_id, moderation_status)
  WHERE moderation_status IN ('pending', 'flagged');
