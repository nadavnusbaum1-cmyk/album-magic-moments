ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS sort_at timestamptz GENERATED ALWAYS AS (COALESCE(taken_at, created_at)) STORED;
DROP INDEX IF EXISTS public.photos_event_chrono_idx;
CREATE INDEX IF NOT EXISTS photos_event_sort_idx ON public.photos (event_id, sort_at, id);