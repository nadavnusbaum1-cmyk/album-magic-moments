ALTER TABLE public.cluster_photo_matches
ADD COLUMN IF NOT EXISTS face_id text;

CREATE UNIQUE INDEX IF NOT EXISTS cluster_photo_matches_cluster_photo_unique
ON public.cluster_photo_matches (cluster_id, photo_id);

CREATE INDEX IF NOT EXISTS cluster_photo_matches_face_id_idx
ON public.cluster_photo_matches (face_id)
WHERE face_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cluster_photo_matches_photo_id_idx
ON public.cluster_photo_matches (photo_id);