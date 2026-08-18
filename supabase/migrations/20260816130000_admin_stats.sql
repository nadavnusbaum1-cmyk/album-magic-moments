-- Per-owner usage aggregates for the super-admin panel (events, photos, storage).
CREATE OR REPLACE FUNCTION public.admin_user_stats()
RETURNS TABLE(owner_id uuid, event_count bigint, photo_count bigint, storage_bytes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.owner_id,
         count(DISTINCT e.id) AS event_count,
         count(p.id) FILTER (WHERE p.deleted_at IS NULL) AS photo_count,
         COALESCE(sum(p.file_size) FILTER (WHERE p.deleted_at IS NULL), 0) AS storage_bytes
  FROM public.events e
  LEFT JOIN public.photos p ON p.event_id = e.id
  GROUP BY e.owner_id;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_user_stats() FROM PUBLIC, anon, authenticated;
