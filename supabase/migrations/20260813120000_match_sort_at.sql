-- Personal albums (photo_matches) and person folders (cluster_photo_matches)
-- must sort by the photo's capture date. PostgREST can't reliably order parent
-- rows by an embedded table's column, so we denormalize the photo's sort_at onto
-- the match rows and order by that. Kept in sync by a BEFORE INSERT trigger.

ALTER TABLE public.photo_matches ADD COLUMN IF NOT EXISTS sort_at timestamptz;
ALTER TABLE public.cluster_photo_matches ADD COLUMN IF NOT EXISTS sort_at timestamptz;

-- Backfill existing rows from the photo's sort_at.
UPDATE public.photo_matches m
  SET sort_at = p.sort_at FROM public.photos p
  WHERE p.id = m.photo_id AND m.sort_at IS NULL;
UPDATE public.cluster_photo_matches m
  SET sort_at = p.sort_at FROM public.photos p
  WHERE p.id = m.photo_id AND m.sort_at IS NULL;

-- Stamp sort_at from the photo whenever a match is created.
CREATE OR REPLACE FUNCTION public.set_match_sort_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sort_at IS NULL THEN
    SELECT sort_at INTO NEW.sort_at FROM public.photos WHERE id = NEW.photo_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS photo_matches_sort_at ON public.photo_matches;
CREATE TRIGGER photo_matches_sort_at BEFORE INSERT ON public.photo_matches
  FOR EACH ROW EXECUTE FUNCTION public.set_match_sort_at();

DROP TRIGGER IF EXISTS cluster_photo_matches_sort_at ON public.cluster_photo_matches;
CREATE TRIGGER cluster_photo_matches_sort_at BEFORE INSERT ON public.cluster_photo_matches
  FOR EACH ROW EXECUTE FUNCTION public.set_match_sort_at();

-- Indexes for ordered, paginated reads.
CREATE INDEX IF NOT EXISTS photo_matches_guest_sort_idx ON public.photo_matches (guest_id, sort_at);
CREATE INDEX IF NOT EXISTS cluster_photo_matches_cluster_sort_idx ON public.cluster_photo_matches (cluster_id, sort_at);
