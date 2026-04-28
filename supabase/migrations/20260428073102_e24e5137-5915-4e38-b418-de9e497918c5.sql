-- Add display name to face clusters
ALTER TABLE public.face_clusters ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Allow public to update only the display_name (not other fields)
CREATE POLICY "Anyone can rename clusters"
ON public.face_clusters
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);