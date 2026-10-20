-- 訪客識別碼先以候選人為範圍做 HMAC，資料列不儲存 cookie、姓名或原始 IP。
CREATE TABLE IF NOT EXISTS candidate_reactions (
  candidate TEXT NOT NULL,
  visitor TEXT NOT NULL,
  choice INTEGER NOT NULL CHECK (choice IN (-1, 1)),
  PRIMARY KEY (candidate, visitor)
) WITHOUT ROWID;

-- 限速只保留短期雜湊 key；與表態資料分開，不記錄其選擇。
CREATE TABLE IF NOT EXISTS reaction_rate_limits (
  key TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  requests INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS reaction_rate_expiry ON reaction_rate_limits(expires_at);
