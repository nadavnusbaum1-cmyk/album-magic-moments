CREATE INDEX IF NOT EXISTS idx_photos_event_created ON public.photos (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_event_processed ON public.photos (event_id, processed);
CREATE INDEX IF NOT EXISTS idx_photos_event_source ON public.photos (event_id, source_label);
CREATE INDEX IF NOT EXISTS idx_photos_event_facecount ON public.photos (event_id, face_count);
CREATE INDEX IF NOT EXISTS idx_photo_matches_event_guest ON public.photo_matches (event_id, guest_id);
CREATE INDEX IF NOT EXISTS idx_cluster_photo_matches_event_cluster ON public.cluster_photo_matches (event_id, cluster_id);
CREATE INDEX IF NOT EXISTS idx_face_clusters_event ON public.face_clusters (event_id);

CREATE OR REPLACE FUNCTION public.get_event_sources(_event_id uuid)
RETURNS TABLE(source_label text, count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT source_label, COUNT(*)::bigint AS count
  FROM public.photos
  WHERE event_id = _event_id AND source_label IS NOT NULL AND source_label <> ''
  GROUP BY source_label
  ORDER BY source_label;
$$;