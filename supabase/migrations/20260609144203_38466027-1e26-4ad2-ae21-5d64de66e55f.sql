ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS taken_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS photos_event_chrono_idx ON public.photos (event_id, COALESCE(taken_at, created_at), id);