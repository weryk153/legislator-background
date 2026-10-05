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
| `pnpm run build:election-map` | 選舉地圖資料（中選會 2018／2022 投開票資料 → `public/data/map/`） |
| `pnpm run build:candidates -- --stage <階段>` | 2026 候選人名單（中選會名冊 PDF → `public/data/candidates/2026/`），附差異報告 |

判決、爭議、名冊修正都採「確認檔」模式：人工查證後把結果寫進對應的 `*-confirmed.json`，再由腳本寫入資料庫；腳本可重跑、會去重。

排程刷新與司法院判決開放資料 feed 見 `.github/workflows/`。

## 設計文件

各功能的規格與實作計畫在 `docs/superpowers/specs/` 與 `docs/superpowers/plans/`。
