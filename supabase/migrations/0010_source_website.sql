-- 候選人／參選團隊網站與新聞來源分開；自述性質另記於來源標題。
alter type source_type add value if not exists 'website';
