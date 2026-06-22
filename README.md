# 公職人員背景資料庫 · legislator-background

以**可查證、附出處**的方式，彙整台灣現任公職人員（立法委員、縣市首長、縣市議員）的**經歷、司法判決、媒體爭議與財產申報**，協助選民判讀。對標 [legislator-wealth.tw](https://legislator-wealth.tw/)（g0v 金錢報，專注財產），本站額外整理判決與爭議。

> ⚠️ **本站非官方網站。** 僅彙整公開資料並標註出處，不對個人作價值判斷。
> 「爭議報導」為外部媒體與維基百科之整理，**屬外部指控、非本站認定之事實，亦未經逐筆查核**；
> 法律狀態以司法、官方資料為準。**未定讞前當事人依法受無罪推定保障。**

## 資料來源

| 欄位 | 來源 |
|---|---|
| 經歷／背景 | 立法院開放資料、中選會候選人學經歷申報 |
| 財產申報 | 監察院公職人員財產申報公報（程式自動解析 PDF） |
| 爭議報導 | 維基百科與所附媒體報導之整理（程式擷取，未逐筆查核；僅保留有原始新聞來源者） |
| 司法判決 | 司法院裁判書開放資料（經人工確認身分後上架；目前累積中） |

政府公開資料依其開放授權條款使用；爭議報導部分內容改寫自維基百科，依 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 授權。

## 核心原則

- **每一筆事實都附可點擊出處**，缺出處者不上架（build 階段 `validate.ts` 強制檢核，違反即中止建置）。
- 判決與爭議**需人工審核**才發布；財產與經歷為政府公開資料，自動上架。
- 不使用「前科」概念，只引用公開判決並標註狀態。

## 技術架構

- **前台**：[Astro](https://astro.build/)（靜態產生）+ 一個 Svelte 互動島（列表篩選／排序／搜尋）。**執行期不連任何資料庫、無後端。**
- **資料**：build 時讀 committed 的 `src/data/officials.json`（快照），所以任何機器／CI 都能建置。快照由本地 [Supabase](https://supabase.com/)（Postgres）經 `pnpm run export:data` 產生。
- **部署**：靜態站，部署於 Cloudflare Pages（`git push` 自動重建）。
- **網址**：`/officials/<slug>/`，slug 由姓名＋職務＋選區決定，重建不變。

```
爬蟲(scraper) → 本地 Supabase → export:data → src/data/officials.json → astro build → dist → Cloudflare Pages
```

## 開發

需 Node 22（見 `.nvmrc`）、[pnpm](https://pnpm.io/)。

```bash
pnpm install
pnpm dev            # 本地開發（讀 src/data/officials.json，免 DB）
pnpm build          # 產生靜態站到 dist/
pnpm test           # vitest
```

更新資料（需本地 Supabase）：

```bash
pnpm run scrape        # 爬蟲 → scraper/out/*.json（人工審核 approved）
pnpm run scrape:import # 匯入本地 Supabase
pnpm run seed:from-json # 從快照還原人工策展的爭議/判決
pnpm run export:data   # 匯出 → src/data/officials.json + meta.json
```

排程刷新與判決開放資料 feed 見 `.github/workflows/`。

## 更正與權利

發現資料有誤、需更新狀態，或您是當事人希望更正／移除特定資料，請至 **[Issues](https://github.com/weryk153/legislator-background/issues)** 回報並附佐證；我們會查核後盡速更正或移除。依《個人資料保護法》，當事人得就本站所載個人資料請求查詢、更正或刪除。

## 授權

程式碼採 MIT 授權；資料部分依各來源之開放授權條款，爭議報導整理依 CC BY-SA 4.0。
