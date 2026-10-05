-- 因參選而建檔、目前非本站收錄之公職者（2026 六都市長候選人中的新人）。
-- 慣例：district = 登記縣市、term = '2026'、is_incumbent = false、departed_reason = null。
alter type office_type add value if not exists 'candidate';
