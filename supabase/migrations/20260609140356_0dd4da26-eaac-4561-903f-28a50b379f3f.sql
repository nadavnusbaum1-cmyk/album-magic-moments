CREATE INDEX IF NOT EXISTS idx_cluster_photo_matches_event_face ON public.cluster_photo_matches (event_id, face_id) WHERE face_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_face_clusters_event_representative_face ON public.face_clusters (event_id, representative_face_id) WHERE representative_face_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photo_matches_guest_photo ON public.photo_matches (guest_id, photo_id);
CREATE INDEX IF NOT EXISTS idx_photos_event_id_id ON public.photos (event_id, id);