-- Remove duplicate councilor officials who have since moved up to legislator/mayor
-- (the 2022 中選會 councilor roster includes people now serving as 立委/首長; their
-- councilor-office row is stale and duplicates the legislator/mayor row).
--
-- Run when local Supabase is up:
--   docker exec supabase_db_legislator-background psql -U postgres -d postgres -f - < scraper/scripts/cleanup-orphan-officials.sql
-- (cascades remove their careers/judgments/controversies/asset_declarations)
delete from officials
where office_type = 'councilor'
  and name in (select name from officials where office_type in ('legislator', 'mayor_magistrate'));
