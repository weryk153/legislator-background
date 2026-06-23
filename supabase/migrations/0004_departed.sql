-- Mark officials who left office mid-term (解職/當選無效/辭職/病逝) instead of deleting them.
-- The roster is a TERM snapshot (立委 第11屆 2024當選；縣市首長/議員 2022當選，任期至2026);
-- departed members stay listed with a reason, rather than silently dropped.
alter table officials add column if not exists departed_reason text;
