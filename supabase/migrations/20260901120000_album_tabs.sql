-- Photographer gallery mode: present the full album organized by folder, shown
-- as tabs (elegant hand-off to the couple), instead of the flat guest grid.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS album_tabs boolean NOT NULL DEFAULT false;
