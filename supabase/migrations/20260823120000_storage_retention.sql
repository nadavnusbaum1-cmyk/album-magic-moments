-- Storage retention: photos are auto-deleted from AWS after a per-plan window.
--   profiles.storage_days      : how long an owner's albums are kept (NULL = forever)
--                                free=14, small/wedding=365, business=NULL (custom)
--   events.storage_expires_at  : computed deadline = created_at + owner storage_days
--                                (NULL = never expires). Denormalized so the host UI
--                                and the expire-events cron can read it directly.
--   events.storage_expired     : set true once the expire-events cron has purged the
--                                event's photos/faces from AWS (the album row is kept
--                                as an "expired" shell so the host understands why).
--   events.storage_expired_at  : when the purge ran.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS storage_days integer DEFAULT 14;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS storage_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS storage_expired boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storage_expired_at timestamptz;

-- Seed retention windows for existing accounts by plan.
UPDATE public.profiles SET storage_days = 14  WHERE plan = 'free';
UPDATE public.profiles SET storage_days = 365 WHERE plan IN ('small', 'wedding');
UPDATE public.profiles SET storage_days = NULL WHERE plan = 'business';

-- Deadline helper: created_at + the owner's storage_days (NULL = never).
CREATE OR REPLACE FUNCTION public.compute_event_expiry(_owner uuid, _created timestamptz)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p.storage_days IS NULL THEN NULL
    ELSE _created + make_interval(days => p.storage_days)
  END
  FROM public.profiles p WHERE p.id = _owner;
$$;

-- Stamp the deadline on insert.
CREATE OR REPLACE FUNCTION public.set_event_expiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.storage_expires_at := public.compute_event_expiry(NEW.owner_id, NEW.created_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_set_expiry ON public.events;
CREATE TRIGGER events_set_expiry BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_event_expiry();

-- When an owner's storage_days changes (plan change), recompute deadlines for
-- their albums that haven't been purged yet.
CREATE OR REPLACE FUNCTION public.recompute_owner_event_expiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.storage_days IS DISTINCT FROM OLD.storage_days THEN
    UPDATE public.events e
      SET storage_expires_at = public.compute_event_expiry(e.owner_id, e.created_at)
      WHERE e.owner_id = NEW.id AND e.storage_expired = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_recompute_expiry ON public.profiles;
CREATE TRIGGER profiles_recompute_expiry AFTER UPDATE OF storage_days ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.recompute_owner_event_expiry();

-- Backfill deadlines for existing events.
UPDATE public.events e
  SET storage_expires_at = public.compute_event_expiry(e.owner_id, e.created_at)
  WHERE e.storage_expired = false;

-- The expire-events cron scans by deadline.
CREATE INDEX IF NOT EXISTS events_storage_expiry_idx
  ON public.events (storage_expires_at)
  WHERE storage_expired = false AND storage_expires_at IS NOT NULL;
