# 開發與資料更新

給要在本機執行、修改程式或更新資料的人。一般讀者請看 [README](../README.md)。

## 架構

- **前台**：[Astro](https://astro.build/) 靜態產生，互動部分（列表篩選、選舉地圖、關係圖）為 Svelte 元件。執行期不連任何資料庫、沒有後端。
- **資料**：建置時讀已 commit 的快照（`src/data/officials.json`、`src/data/graph.json`、`public/data/**`），任何機器或 CI 都能建置。快照由本機 [Supabase](https://supabase.com/)（Postgres）匯出。
- **部署**：Cloudflare Pages，push 到 `master` 即自動重建。push 其他分支會產生公開的預覽網址，未審定的資料請勿 push。
- **網址**：個人頁為 `/officials/<slug>/`，slug 由姓名、職務、選區決定，重建不會變。

```
爬蟲（scraper/）→ 本機 Supabase → export:data → src/data/*.json → astro build → dist/ → Cloudflare Pages
```

## 本機執行

需 Node 22（見 `.nvmrc`）與 [pnpm](https://pnpm.io/)。

```bash
pnpm install
pnpm dev     # 本機開發（讀快照，不需資料庫）
pnpm build   # 產生靜態站到 dist/
pnpm test    # vitest
```

## 更新資料（需本機 Supabase）

本機 Supabase 跑在 Docker（本專案用 OrbStack），`supabase start` 後 API 在 `http://127.0.0.1:54421`（見 `.env`）。

| 指令 | 用途 |
|---|---|
| `pnpm run scrape` → `pnpm run scrape:import` | 爬蟲 → 人工審核 `scraper/out/*.json` → 匯入資料庫 |
| `pnpm run seed:from-json` | 從快照還原人工策展的爭議／判決 |
| `pnpm run judgments:record` | 寫入人工確認的判決（`scraper/judgments-confirmed.json`） |
| `pnpm run controversies:record` | 寫入人工核准的爭議（`scraper/controversies-confirmed.json`） |
| `pnpm run roster:record` | 名冊修正（新增、離任、更名；`scraper/roster-confirmed.json`） |
| `pnpm run donations:record` | 政治獻金（監察院 ardata） |
| `pnpm run export:data` | 匯出 → `src/data/officials.json`、`meta.json` |
| `pnpm run append:relationships` | 關係資料唯讀預檢；加 `--apply` 才增量寫入本機資料庫 |
| `pnpm run export:graph` | 匯出人物關係 → `src/data/graph.json` |
| `pnpm run build:election-map` | 選舉地圖資料（中選會 2018／2022 投開票資料 → `public/data/map/`） |
| `pnpm run build:candidates -- --stage <階段>` | 2026 候選人名單（中選會名冊 PDF → `public/data/candidates/2026/`），附差異報告 |

判決、爭議、名冊修正都採「確認檔」模式：人工查證後把結果寫進對應的 `*-confirmed.json`，再由腳本寫入資料庫；腳本可重跑、會去重。

排程刷新與司法院判決開放資料 feed 見 `.github/workflows/`。

### 新增人物關係

逐筆查核公開來源後，將關係加入 `scraper/relationships-curated.json`。新增列須有固定 UUID `id`、查核日 `reviewedAt`、名冊 `subjectId`，對象為公職人物時另填 `counterpartId`；議員與同名立委不能只靠姓名匹配。維基來源另記錄 `sourceRevision`，方便回查當時版本。歷史任職用「曾任」描述，不推定目前仍有幕僚或政治關係。

名冊外人物的固定 ID 登記在 `scraper/entity-identities.json`，鍵為姓名或 `姓名::counterpartDistinct`，須核對職務與身分後才重用。增量匯入保留既有人物、照片、來源與關係；先完整驗證，再建立缺少的端點、來源、關係。中途失敗可重跑，已存在且一致的紀錄會略過，內容衝突則中止。

```bash
pnpm run append:relationships          # 唯讀預檢
pnpm run append:relationships --apply  # 寫入本機 Supabase
pnpm run export:graph                  # 更新網站快照
```

舊的 `import:relationships` 會清除再重建非判決關係，日常追加請用上述增量流程。重建流程也沿用固定人物 ID，以保留人物查詢連結。

2026-10-13 首批議員擴充：42 位議員、76 條關係，來源為 43 條議會官網、13 條新聞、20 條維基條目；新增 27 位名冊外人物。圖譜由 416 節點／360 關係增為 482 節點／436 關係，有關係資料的議員由 22 位增為 61 位。此批優先收錄公開履歷可核對的幕僚與親屬關係，並非全國議員的完整關係名冊。

2026-10-13 第二批跨縣市擴充：35 位議員及 1 位立委、54 條歷史幕僚／任職關係，來源為 9 條議會官網、9 條新聞、36 條維基條目；新增 22 位名冊外人物。圖譜增至 538 節點／490 關係，有關係資料的議員增至 95 位。最大連通群由 158 增至 186 個節點，原有三個連通群合併；同時新增地方人物群，因此整體連通群數由 87 增至 97。兩批皆已比對匯入前後資料，既有節點、關係與來源無刪除或覆寫。

## 設計文件

各功能的規格與實作計畫在 `docs/superpowers/specs/` 與 `docs/superpowers/plans/`。
