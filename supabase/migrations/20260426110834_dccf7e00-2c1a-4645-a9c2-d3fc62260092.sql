-- Guests table
CREATE TABLE public.guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  selfie_path TEXT,
  rekognition_face_id TEXT,
  magic_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  photo_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Photos table
CREATE TABLE public.photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'photographer',
  processed BOOLEAN NOT NULL DEFAULT false,
  face_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Photo matches: which guest appears in which photo
CREATE TABLE public.photo_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  similarity NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(guest_id, photo_id)
);

CREATE INDEX idx_photo_matches_guest ON public.photo_matches(guest_id);
CREATE INDEX idx_photo_matches_photo ON public.photo_matches(photo_id);
CREATE INDEX idx_photos_processed ON public.photos(processed);
CREATE INDEX idx_guests_token ON public.guests(magic_token);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_guests_updated_at
BEFORE UPDATE ON public.guests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_matches ENABLE ROW LEVEL SECURITY;

-- For MVP (no auth), edge functions use service role key.
-- Public policies are intentionally restrictive; reads/writes go through edge functions.
CREATE POLICY "Guests readable by anyone with token (via edge function)"
  ON public.guests FOR SELECT USING (false);

CREATE POLICY "Photos not directly readable"
  ON public.photos FOR SELECT USING (false);

CREATE POLICY "Matches not directly readable"
  ON public.photo_matches FOR SELECT USING (false);

-- Storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('selfies', 'selfies', false),
       ('event-photos', 'event-photos', true);

-- Public can read event photos
CREATE POLICY "Event photos publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-photos');

-- Anyone can upload to event-photos and selfies (MVP, edge functions handle validation)
CREATE POLICY "Anyone can upload event photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'event-photos');

CREATE POLICY "Anyone can upload selfies"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'selfies');