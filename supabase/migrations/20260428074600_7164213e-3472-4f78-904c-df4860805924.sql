-- Add S3 fields to photos
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'supabase';
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS s3_key TEXT;
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS processing_error TEXT;

CREATE INDEX IF NOT EXISTS idx_photos_unprocessed ON public.photos(created_at) WHERE processed = false;

-- Enable extensions for background processing
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;