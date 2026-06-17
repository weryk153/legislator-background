-- Add a stable human-readable slug to officials so the scraper can upsert by slug
-- (its target id) without needing to know the generated uuid. id (uuid) stays the
-- primary key and the site's URL key; slug is an additional unique handle.
alter table officials add column slug text unique;
