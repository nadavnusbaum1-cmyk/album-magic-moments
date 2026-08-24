-- Storage retention now starts when the FIRST photo is uploaded, not when the
-- event is created. events.first_upload_at is stamped by a trigger on the first
-- photo insert, and storage_expires_at = first_upload_at + owner storage_days.
-- Until the first upload there is no clock (both stay NULL).

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS first_upload_at timestamptz;

-- Retention no longer keys off event creation.
DROP TRIGGER IF EXISTS events_set_expiry ON public.events;
DROP FUNCTION IF EXISTS public.set_event_expiry();

-- Deadline = anchor + owner storage_days (NULL anchor or NULL storage_days = none).
-- Param name kept as _created (can't be renamed via CREATE OR REPLACE); it now
-- carries the first-upload anchor rather than the creation date.
CREATE OR REPLACE FUNCTION public.compute_event_expiry(_owner uuid, _created timestamptz)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _created IS NULL THEN NULL
    WHEN p.storage_days IS NULL THEN NULL
    ELSE _created + make_interval(days => p.storage_days)
  END
  FROM public.profiles p WHERE p.id = _owner;
$$;

-- Stamp first_upload_at + storage_expires_at when the first photo arrives.
CREATE OR REPLACE FUNCTION public.stamp_first_upload()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.events e
    SET first_upload_at = now(),
        storage_expires_at = public.compute_event_expiry(e.owner_id, now())
    WHERE e.id = NEW.event_id AND e.first_upload_at IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS photos_stamp_first_upload ON public.photos;
CREATE TRIGGER photos_stamp_first_upload AFTER INSERT ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.stamp_first_upload();

-- Plan/storage_days change: recompute deadlines from first_upload_at.
CREATE OR REPLACE FUNCTION public.recompute_owner_event_expiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.storage_days IS DISTINCT FROM OLD.storage_days THEN
    UPDATE public.events e
      SET storage_expires_at = public.compute_event_expiry(e.owner_id, e.first_upload_at)
      WHERE e.owner_id = NEW.id AND e.storage_expired = false;
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill: anchor existing events on their earliest photo; clear the clock for
-- events that have no photos yet.
UPDATE public.events e
  SET first_upload_at = sub.first_at,
      storage_expires_at = public.compute_event_expiry(e.owner_id, sub.first_at)
  FROM (SELECT event_id, min(created_at) AS first_at FROM public.photos GROUP BY event_id) sub
  WHERE e.id = sub.event_id AND e.storage_expired = false;

UPDATE public.events e
  SET first_upload_at = NULL, storage_expires_at = NULL
  WHERE e.storage_expired = false
    AND NOT EXISTS (SELECT 1 FROM public.photos p WHERE p.event_id = e.id);
