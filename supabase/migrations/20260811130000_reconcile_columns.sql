-- Upload-side error message (distinct from processing_error), written by
-- confirm-upload / reconcile-storage when an object is missing, too large, or
-- an upload never completed. Kept separate so a photo can surface an upload
-- failure independently of a face-processing failure.
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS upload_error text;
