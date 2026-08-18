-- SaaS account plans (manual approval; payment provider deferred).
--   plan          : 'free' | 'small' | 'wedding' | 'business'
--   plan_status   : 'active' (can create/upload) | 'pending' (paid plan awaiting
--                    manual approval) | 'suspended'
--   photo_limit   : per-event photo cap (NULL = unlimited)
--   event_limit   : max number of events (NULL = unlimited)
--   plan_requested: the paid plan a user asked for, awaiting approval
--   plan_note     : free-text admin note
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS photo_limit integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS event_limit integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS plan_requested text,
  ADD COLUMN IF NOT EXISTS plan_note text,
  ADD COLUMN IF NOT EXISTS plan_updated_at timestamptz;

-- Existing accounts stay active on the free tier's default limits. The owner
-- account is upgraded to 'business'/unlimited via SQL after deploy (see docs).
UPDATE public.profiles
  SET photo_limit = COALESCE(photo_limit, 50), event_limit = COALESCE(event_limit, 1)
  WHERE plan = 'free';
