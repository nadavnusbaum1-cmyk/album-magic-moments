
-- Unique slug for events (lowercase)
CREATE UNIQUE INDEX IF NOT EXISTS events_slug_unique ON public.events (lower(slug));
CREATE INDEX IF NOT EXISTS photos_event_idx ON public.photos (event_id);
CREATE INDEX IF NOT EXISTS face_clusters_event_idx ON public.face_clusters (event_id);
CREATE INDEX IF NOT EXISTS guests_event_idx ON public.guests (event_id);
CREATE INDEX IF NOT EXISTS guests_token_idx ON public.guests (magic_token);
