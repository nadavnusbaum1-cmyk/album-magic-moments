-- Add face bounding boxes and media type for video/HEIC support
ALTER TABLE public.face_clusters
  ADD COLUMN IF NOT EXISTS representative_bbox jsonb;

ALTER TABLE public.cluster_photo_matches
  ADD COLUMN IF NOT EXISTS bounding_box jsonb;

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS content_type text;
