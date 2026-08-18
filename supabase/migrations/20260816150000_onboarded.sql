-- Track whether a user has been through the plan-selection / onboarding step.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false;

-- Existing accounts are already using the app — skip onboarding for them.
UPDATE public.profiles SET onboarded = true;
