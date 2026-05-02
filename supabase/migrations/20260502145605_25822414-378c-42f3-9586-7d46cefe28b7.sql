
-- ========== WIPE EXISTING DATA ==========
DELETE FROM public.cluster_photo_matches;
DELETE FROM public.photo_matches;
DELETE FROM public.face_clusters;
DELETE FROM public.guests;
DELETE FROM public.photos;

-- ========== ROLES ==========
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('super_admin', 'host');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles readable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Profiles readable by everyone" ON public.profiles FOR SELECT TO public USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

DROP POLICY IF EXISTS "Roles readable by self or super_admin" ON public.user_roles;
CREATE POLICY "Roles readable by self or super_admin"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

-- ========== EVENTS ==========
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  event_date date,
  cover_image_url text,
  show_people boolean NOT NULL DEFAULT true,
  show_all_photos boolean NOT NULL DEFAULT true,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS events_owner_idx ON public.events(owner_id);
CREATE INDEX IF NOT EXISTS events_slug_idx ON public.events(slug);

CREATE TABLE IF NOT EXISTS public.event_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);
ALTER TABLE public.event_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_event_host(_user_id uuid, _event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND (e.owner_id = _user_id
           OR EXISTS (SELECT 1 FROM public.event_members m WHERE m.event_id = _event_id AND m.user_id = _user_id)
           OR public.has_role(_user_id, 'super_admin'))
  );
$$;

DROP POLICY IF EXISTS "Published events readable by everyone" ON public.events;
DROP POLICY IF EXISTS "Hosts read their events" ON public.events;
DROP POLICY IF EXISTS "Hosts insert events they own" ON public.events;
DROP POLICY IF EXISTS "Hosts update their events" ON public.events;
DROP POLICY IF EXISTS "Owners delete their events" ON public.events;
CREATE POLICY "Published events readable by everyone" ON public.events FOR SELECT TO public USING (is_published = true);
CREATE POLICY "Hosts read their events" ON public.events FOR SELECT TO authenticated USING (public.is_event_host(auth.uid(), id));
CREATE POLICY "Hosts insert events they own" ON public.events FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Hosts update their events" ON public.events FOR UPDATE TO authenticated USING (public.is_event_host(auth.uid(), id));
CREATE POLICY "Owners delete their events" ON public.events FOR DELETE TO authenticated USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Hosts read members of their events" ON public.event_members;
DROP POLICY IF EXISTS "Owners manage members" ON public.event_members;
CREATE POLICY "Hosts read members of their events" ON public.event_members FOR SELECT TO authenticated USING (public.is_event_host(auth.uid(), event_id));
CREATE POLICY "Owners manage members" ON public.event_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.owner_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.owner_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'))));

-- ========== ADD event_id ==========
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS source_label text;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE public.face_clusters ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE public.cluster_photo_matches ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE public.photo_matches ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS photos_event_idx ON public.photos(event_id);
CREATE INDEX IF NOT EXISTS guests_event_idx ON public.guests(event_id);
CREATE INDEX IF NOT EXISTS face_clusters_event_idx ON public.face_clusters(event_id);
CREATE INDEX IF NOT EXISTS cluster_photo_matches_event_idx ON public.cluster_photo_matches(event_id);
CREATE INDEX IF NOT EXISTS photo_matches_event_idx ON public.photo_matches(event_id);

-- ========== Fix RLS on existing tables ==========
DROP POLICY IF EXISTS "Photos publicly readable" ON public.photos;
DROP POLICY IF EXISTS "Photos not directly readable" ON public.photos;
DROP POLICY IF EXISTS "Face clusters publicly readable" ON public.face_clusters;
DROP POLICY IF EXISTS "Cluster matches publicly readable" ON public.cluster_photo_matches;
DROP POLICY IF EXISTS "Anyone can rename clusters" ON public.face_clusters;
DROP POLICY IF EXISTS "Hosts read event photos" ON public.photos;
DROP POLICY IF EXISTS "Hosts read event clusters" ON public.face_clusters;
DROP POLICY IF EXISTS "Hosts read cluster matches" ON public.cluster_photo_matches;
DROP POLICY IF EXISTS "Hosts read photo matches" ON public.photo_matches;
DROP POLICY IF EXISTS "Hosts read guests" ON public.guests;
DROP POLICY IF EXISTS "Guests readable by anyone with token (via edge function)" ON public.guests;
DROP POLICY IF EXISTS "Matches not directly readable" ON public.photo_matches;

CREATE POLICY "Hosts read event photos" ON public.photos FOR SELECT TO authenticated USING (event_id IS NOT NULL AND public.is_event_host(auth.uid(), event_id));
CREATE POLICY "Hosts read event clusters" ON public.face_clusters FOR SELECT TO authenticated USING (event_id IS NOT NULL AND public.is_event_host(auth.uid(), event_id));
CREATE POLICY "Hosts read cluster matches" ON public.cluster_photo_matches FOR SELECT TO authenticated USING (event_id IS NOT NULL AND public.is_event_host(auth.uid(), event_id));
CREATE POLICY "Hosts read photo matches" ON public.photo_matches FOR SELECT TO authenticated USING (event_id IS NOT NULL AND public.is_event_host(auth.uid(), event_id));
CREATE POLICY "Hosts read guests" ON public.guests FOR SELECT TO authenticated USING (event_id IS NOT NULL AND public.is_event_host(auth.uid(), event_id));

-- Storage: drop anonymous insert policies
DROP POLICY IF EXISTS "Anyone can upload event photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload selfies" ON storage.objects;

-- updated_at triggers (drop+create instead of IF NOT EXISTS)
DROP TRIGGER IF EXISTS profiles_updated ON public.profiles;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS events_updated ON public.events;
CREATE TRIGGER events_updated BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
