-- Face cluster table: each row = one unique person Rekognition has seen
CREATE TABLE public.face_clusters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  representative_face_id TEXT NOT NULL,
  representative_photo_id UUID,
  representative_storage_path TEXT,
  photo_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.face_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Face clusters publicly readable"
  ON public.face_clusters FOR SELECT
  USING (true);

-- Mapping cluster <-> photo (a cluster can appear in many photos; a photo can have many clusters)
CREATE TABLE public.cluster_photo_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cluster_id UUID NOT NULL REFERENCES public.face_clusters(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  similarity NUMERIC NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cluster_id, photo_id)
);

ALTER TABLE public.cluster_photo_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cluster matches publicly readable"
  ON public.cluster_photo_matches FOR SELECT
  USING (true);

-- Public-read for photos so the home gallery and folders work
CREATE POLICY "Photos publicly readable"
  ON public.photos FOR SELECT
  USING (true);

-- Link guests to their cluster (optional)
ALTER TABLE public.guests ADD COLUMN cluster_id UUID REFERENCES public.face_clusters(id) ON DELETE SET NULL;

CREATE INDEX idx_cluster_photo_matches_cluster ON public.cluster_photo_matches(cluster_id);
CREATE INDEX idx_cluster_photo_matches_photo ON public.cluster_photo_matches(photo_id);

CREATE TRIGGER update_face_clusters_updated_at
  BEFORE UPDATE ON public.face_clusters
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();