-- Per-folder sharing: the organizer chooses which folders (source_label) appear
-- on the public album. `hidden_sources` is the list of hidden folder names
-- (default empty = everything shared).
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS hidden_sources jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Consolidate all guest uploads into a single "Guest uploads" folder so that
-- "share photographer photos only" is one toggle. The guest's name is preserved
-- separately in photos.uploaded_by.
UPDATE public.photos SET source_label = 'Guest uploads'
  WHERE source = 'guest_upload' AND (source_label IS NULL OR source_label <> 'Guest uploads');

-- Ensure every photo has a folder so folder-visibility filtering is unambiguous
-- (a NULL source_label would otherwise be excluded by a NOT IN filter).
UPDATE public.photos SET source_label = 'Photos' WHERE source_label IS NULL;
