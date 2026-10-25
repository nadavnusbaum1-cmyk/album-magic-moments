-- Pixieset "overlay" import: photos that live on an external gallery (Pixieset)
-- and are NOT re-hosted. We cache only a small thumbnail in S3; the medium/full
-- renditions are served straight from Pixieset's CDN via source_url.
--
-- source_url holds the Pixieset image BASE (protocol-relative), e.g.
--   //images.pixieset.com/347996511/<hash>
-- from which any size variant is derived by appending "-<size>.jpg"
-- (-thumb, -small, -medium, -large, -xlarge, -xxlarge).
alter table photos add column if not exists source_url text;
