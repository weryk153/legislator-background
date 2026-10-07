# 全站報章風改版（EVA 點綴）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把整站改成白底墨黑的報紙版面，以 EVA 標題卡式的壓扁特粗明朝與黑塊做點綴，資料與 SEO 標題不變。

**Architecture:** 視覺系統集中在 `src/styles/tokens.css`（色票、`.sq` 壓扁字、`.tcard` 標題卡、`.sh` 章節標、`.ph-box` 頭像、直角元件），Astro 頁面透過兩個新元件 `TitleCard.astro`、`SectionHead.astro` 使用；Svelte 元件直接套全域 class。壓扁字補寬的字數計算放在純函式 `src/lib/squash.ts`，Astro 與 Svelte 共用。時程軸抽成 `ElectionTimeline.astro` 供首頁與 /elections 共用。改版前先擷取全站 `<title>`／`<h1>` 基準，最後比對確保 SEO 標題不變。

**Tech Stack:** Astro 5（靜態輸出）、Svelte 5、TypeScript、vitest、tsx。

**Spec:** `docs/superpowers/specs/2026-10-07-newspaper-eva-redesign-design.md`

**定案 mock（未進版控，視覺對照用）：** `.superpowers/brainstorm/33035-1791351644/content/full-home-v3.html`、`full-county-v3.html`

## Global Constraints

- Branch：`feat/newspaper-redesign`（已存在，含 spec commit）。
- 淺色 `--bg: #fff`、`--fg: #000`、`--muted: #4d4d4d`、`--faint: #767676`；深色模式保留，黑塊在深色模式反轉為白底黑字。
- 朱紅只用在：標題卡直排小字、時程「今天」、「已解職」。
- 字體只用既有 Noto Serif TC 900（Google Fonts 已載入 600/700/900），不新增字型。
- 壓扁比例：報頭 .7、標題卡大字 .62、章節標 .7、人名 .78～.8。
- 各頁 `<title>` 與 `<h1>` 文字不得改變，唯一例外：首頁 `<h1>` 由「看見政治人物的背景」改為報頭「政治人物背景資料庫」。
- 中立原則：候選人同字級、同版型、依名冊順序、筆數同色只列數字。
- 不動：選舉地圖著色與幾何、關係圖節點繪製、分享縮圖（`public/og.png`、`public/og/`）、資料與文案。
- 本機預覽一律用 `python3 -m http.server 4399` 在 `dist/` 起站；**不要碰 4321**（使用者自己的 dev server）。
- `astro check` 改版前基準：12 個錯誤（皆為既有、與本案無關），改版後不得增加。

## Review Focus

1. **長字串標題卡在手機上溢出**：個人頁小字用 `roleText`（如「立法委員・全國不分區及僑居國外國民」），390px 寬時必須縮字而不是撐破版面——Task 1 的 `fitStyle` 單元測試＋Task 9、Task 11 手機截圖。
2. **含半形字的壓扁字補寬過頭**：「第1選舉區」「2026」若按全形字數收寬，負 margin 會吃掉後面的字——Task 1 `squashWidth` 對半形字用 0.56em 的測試。
3. **深色模式黑塊消失**：黑標題卡、章節標在深色底上必須反轉成白底黑字——Task 2 的 token 與 Task 11 深色截圖。
4. **SEO 標題被標題卡改掉**：縣市頁、個人頁的 `<h1>` 必須仍是原字串（標題卡視覺字串不同時用 `sr-only`）——Task 0 基準，Task 5、7、8、9、10、11 每次建置後比對。
5. **報頭日期過期**：靜態頁不能把建置日當「今天」（時程軸剛修過同一個 bug）——Task 3 報頭日期由瀏覽器端填入，無 JS 時不顯示。

---

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `scraper/lib/seoHeadings.ts` | 新增 | 從 HTML 抽出 `<title>` 與 `<h1>` 文字（純函式） |
| `scraper/scripts/seo-headings.ts` | 新增 | 掃 `dist/` 寫基準或比對基準 |
| `test/seoHeadings.test.ts` | 新增 | 抽取函式測試 |
| `src/lib/squash.ts` | 新增 | 壓扁字寬度計算與 style 字串 |
| `test/squash.test.ts` | 新增 | 寬度計算測試 |
| `src/styles/tokens.css` | 修改 | 色票、`.sq`、`.sr-only`、`.tcard`、`.sh`、`.ph-box`、直角、`.pill` |
| `src/layouts/Base.astro` | 修改 | 報頭、導覽、頁尾 |
| `src/components/TitleCard.astro` | 新增 | 黑標題卡 |
| `src/components/SectionHead.astro` | 新增 | 章節標（黑塊＋粗線） |
| `src/components/ElectionTimeline.astro` | 新增 | 線性時程軸＋瀏覽器端換日腳本（自 elections.astro 搬出） |
| `src/pages/index.astro`、`src/components/OfficialTable.svelte` | 修改 | 首頁 |
| `src/components/ChiefRaceCard.astro` | 修改 | D1 兩欄人物欄 |
| `src/pages/elections/2026/[county].astro` | 修改 | 縣市選舉頁 |
| `src/pages/elections.astro`、`src/components/ElectionPanel.svelte` | 修改 | 選舉總覽頁 |
| `src/pages/officials/[id].astro` | 修改 | 個人頁 |
| `src/pages/{donors,graph,about,404}.astro`、`src/pages/elections/2022.astro`、`src/components/{DonorSearch,RelationshipGraph,ElectionMap}.svelte`、`src/pages/graph.astro` | 修改 | 其餘頁與元件直角化 |

---

### Task 0: SEO 標題基準

**Files:**
- Create: `scraper/lib/seoHeadings.ts`
- Create: `scraper/scripts/seo-headings.ts`
- Test: `test/seoHeadings.test.ts`

**Interfaces:**
- Produces: `extractHeadings(html: string): { title: string; h1: string[] }`；CLI `pnpm exec tsx scraper/scripts/seo-headings.ts --write <file>` 與 `--check <file>`。

- [ ] **Step 1: Write the failing test**

```ts
// test/seoHeadings.test.ts
import { describe, it, expect } from 'vitest';
import { extractHeadings } from '../scraper/lib/seoHeadings';

describe('extractHeadings', () => {
  it('抽出 title 與所有 h1 的純文字，去標籤、解實體、壓空白', () => {
    const html = `<html><head><title>周倪安｜政治人物背景</title></head><body>
      <h1 class="sr-only">周倪安</h1>
      <h1 data-x="1"><span class="a">2026</span>
        <span>九合一&amp;選舉</span></h1></body></html>`;
    expect(extractHeadings(html)).toEqual({ title: '周倪安｜政治人物背景', h1: ['周倪安', '2026 九合一&選舉'] });
  });
  it('沒有 h1 時回空陣列', () => {
    expect(extractHeadings('<title>x</title><p>y</p>')).toEqual({ title: 'x', h1: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/seoHeadings.test.ts`
Expected: FAIL（`Cannot find module '../scraper/lib/seoHeadings'`）

- [ ] **Step 3: Write minimal implementation**

```ts
// scraper/lib/seoHeadings.ts
// 從建置輸出的 HTML 抽出 <title> 與 <h1> 純文字，供改版前後比對 SEO 標題是否被改動。
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

function plain(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m])
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractHeadings(html: string): { title: string; h1: string[] } {
  const title = plain(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => plain(m[1]));
  return { title, h1 };
}
```

```ts
// scraper/scripts/seo-headings.ts
// 改版前後比對各頁 <title>／<h1>：
//   pnpm exec tsx scraper/scripts/seo-headings.ts --write .superpowers/seo-baseline.json
//   pnpm exec tsx scraper/scripts/seo-headings.ts --check .superpowers/seo-baseline.json
// ALLOWED_H1_CHANGES 列出刻意改動的頁面（首頁 h1 改為報頭站名）。
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { extractHeadings } from '../lib/seoHeadings';

const DIST = join(process.cwd(), 'dist');
const ALLOWED_H1_CHANGES: Record<string, string[]> = { '/': ['政治人物背景資料庫'] };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : f === 'index.html' || f === '404.html' ? [p] : [];
  });
}

function scan(): Record<string, { title: string; h1: string[] }> {
  const out: Record<string, { title: string; h1: string[] }> = {};
  for (const f of walk(DIST)) {
    const route = '/' + relative(DIST, f).replace(/index\.html$/, '');
    out[route] = extractHeadings(readFileSync(f, 'utf8'));
  }
  return out;
}

const [mode, file] = process.argv.slice(2);
if (mode === '--write') {
  writeFileSync(file, JSON.stringify(scan(), null, 1));
  console.log(`寫入基準 ${file}`);
} else if (mode === '--check') {
  const base = JSON.parse(readFileSync(file, 'utf8')) as ReturnType<typeof scan>;
  const now = scan();
  const errs: string[] = [];
  for (const [route, b] of Object.entries(base)) {
    const n = now[route];
    if (!n) { errs.push(`${route}：頁面消失`); continue; }
    if (n.title !== b.title) errs.push(`${route}：title「${b.title}」→「${n.title}」`);
    const want = ALLOWED_H1_CHANGES[route] ?? b.h1;
    if (JSON.stringify(n.h1) !== JSON.stringify(want)) errs.push(`${route}：h1 ${JSON.stringify(b.h1)} → ${JSON.stringify(n.h1)}`);
  }
  for (const route of Object.keys(now)) if (!base[route]) errs.push(`${route}：新頁面（基準沒有）`);
  if (errs.length) { console.error(errs.slice(0, 50).join('\n') + `\n共 ${errs.length} 處不同`); process.exit(1); }
  console.log(`${Object.keys(base).length} 頁 title／h1 與基準一致`);
} else {
  console.error('用法：--write <file> | --check <file>'); process.exit(2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/seoHeadings.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 5: 擷取改版前基準**

Run: `pnpm exec astro build && pnpm exec tsx scraper/scripts/seo-headings.ts --write .superpowers/seo-baseline.json && pnpm exec tsx scraper/scripts/seo-headings.ts --check .superpowers/seo-baseline.json`
Expected：`--check` 只報 `/` 一筆 h1 不同（`ALLOWED_H1_CHANGES` 已預先寫入改版後的值，改版前當然對不上）——**這是預期的**，確認只有這一筆即可。`.superpowers/` 已在 `.gitignore`，基準檔不進版控。

- [ ] **Step 6: Commit**

```bash
git add scraper/lib/seoHeadings.ts scraper/scripts/seo-headings.ts test/seoHeadings.test.ts
git commit -m "chore(seo): 改版前後比對各頁 title／h1 的檢查腳本"
```

---

### Task 1: 壓扁字寬度計算

**Files:**
- Create: `src/lib/squash.ts`
- Test: `test/squash.test.ts`

**Interfaces:**
- Produces:
  - `squashWidth(text: string): number` —— 以 em 計的未壓扁寬度：全形字 1、半形字（ASCII、拉丁）0.56。
  - `squashStyle(text: string, k?: number): string` —— 回傳 `"--k:0.7;--n:4"` 形式的 inline style（`k` 預設 0.7）。
  - `fitStyle(text: string, k: number, maxPx: number, reservePx: number): string` —— 在 `squashStyle` 之外加上 `font-size:min(<maxPx>px, calc((100vw - <reservePx>px) / <n*k>))`，讓長字串在窄螢幕自動縮字。

- [ ] **Step 1: Write the failing test**

```ts
// test/squash.test.ts
import { describe, it, expect } from 'vitest';
import { squashWidth, squashStyle, fitStyle } from '../src/lib/squash';

describe('squashWidth', () => {
  it('全形字每字 1em', () => {
    expect(squashWidth('政治人物背景資料庫')).toBe(9);
    expect(squashWidth('縣長・議員選舉')).toBe(7);
  });
  it('半形數字與拉丁字每字 0.56em，避免負 margin 吃掉後面的字', () => {
    expect(squashWidth('2026')).toBe(2.24);
    expect(squashWidth('第1選舉區')).toBe(4.56);
  });
  it('空字串為 0', () => {
    expect(squashWidth('')).toBe(0);
  });
});

describe('squashStyle', () => {
  it('帶出壓扁比例與寬度', () => {
    expect(squashStyle('名冊')).toBe('--k:0.7;--n:2');
    expect(squashStyle('澎湖縣', 0.62)).toBe('--k:0.62;--n:3');
  });
});

describe('fitStyle', () => {
  it('長字串在窄螢幕縮字：font-size 取 maxPx 與 (100vw - reserve) / (n*k) 的較小者', () => {
    expect(fitStyle('政治獻金', 0.62, 84, 120)).toBe('--k:0.62;--n:4;font-size:min(84px, calc((100vw - 120px) / 2.48))');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/squash.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/squash.ts
// 壓扁特粗明朝（tokens.css 的 .sq）用 transform: scaleX 壓扁，但 transform 不改版面寬度，
// 壓扁後右側會留一截空白。.sq 以 margin-right: (k-1) × n × .97em 收回，n 就是這裡算的
// 「未壓扁寬度（em）」。半形字只有約 0.56em 寬，若一律當 1em 算，負 margin 會收過頭、
// 吃掉後面的字。
const HALF_WIDTH = /[ -ɏ]/;

export function squashWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += HALF_WIDTH.test(ch) ? 0.56 : 1;
  return Math.round(w * 100) / 100;
}

export function squashStyle(text: string, k = 0.7): string {
  return `--k:${k};--n:${squashWidth(text)}`;
}

/** 標題卡、報頭這類單行大字：桌機用 maxPx，窄螢幕依可用寬度（100vw 扣掉 reservePx）縮字，不換行也不溢出。 */
export function fitStyle(text: string, k: number, maxPx: number, reservePx: number): string {
  const units = Math.round(squashWidth(text) * k * 100) / 100;
  return `${squashStyle(text, k)};font-size:min(${maxPx}px, calc((100vw - ${reservePx}px) / ${units}))`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/squash.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add src/lib/squash.ts test/squash.test.ts
git commit -m "feat(style): 壓扁特粗明朝的寬度計算（半形字按 0.56em）"
```

---

### Task 2: 視覺 tokens 與全域元件樣式

**Files:**
- Modify: `src/styles/tokens.css`（`:root` 色票、`:root[data-theme="dark"]`、utilities 區）
- Modify: `src/layouts/Base.astro:31`（`theme-color`）

**Interfaces:**
- Produces（全域 class，之後所有任務使用）：
  - `.sq`（需 inline `--k`、`--n`，由 `squashStyle`／`fitStyle` 產生）
  - `.sr-only`
  - `.tcard`、`.tcard-v`、`.tcard-body`、`.tcard-line`、`.tcard-l1`、`.tcard-l2`
  - `.sh`、`.sh-text`
  - `.ph-box`（直式方框頭像）、`.ph-box.ph`（無照片佔位）
  - tokens：`--block-bg`、`--block-fg`、`--block-accent`
  - `.pill` 改直角黑框；`--radius: 0`

- [ ] **Step 1: 改淺色色票**（`src/styles/tokens.css` `:root` 的 color 區，取代 `--bg` 到 `--row-hover` 這段）

```css
  /* color — 報紙：白底墨黑，單一朱紅點綴（只用在標題卡直排字、時程「今天」、「已解職」） */
  --bg: #fff;
  --surface: #fff;
  --fg: #000;
  --muted: #4d4d4d;   /* 白底對比約 8.5:1 */
  --faint: #767676;   /* 白底對比約 4.5:1（AA 下限） */
  --line: rgba(0, 0, 0, 0.14);
  --line-strong: #000;
  --accent: #b3271e;
  --accent-wash: rgba(179, 39, 30, 0.06);
  --row-hover: rgba(0, 0, 0, 0.04);
  /* 黑塊（標題卡、章節標）：淺色模式黑底白字；深色模式反轉，否則與背景融成一片。 */
  --block-bg: #000;
  --block-fg: #fff;
  --block-accent: #ff4a3a;  /* 黑底上的朱紅要提亮才讀得到 */
```

同一個 `:root` 內把 `--radius: 8px;` 改為 `--radius: 0;`。

- [ ] **Step 2: 改深色色票**（`:root[data-theme="dark"]` 內，`--line-strong` 改為不透明、加上黑塊 tokens）

```css
  --line-strong: #ece9e2;
  --block-bg: #ece9e2;
  --block-fg: #131312;
  --block-accent: #b3271e;
```

- [ ] **Step 3: 加全域 class**（`src/styles/tokens.css`，接在 `.pill { … }` 之後，並把 `.pill` 改成直角黑框）

```css
.pill {
  display: inline-block;
  font-size: var(--t-xs);
  font-family: var(--sans);
  letter-spacing: 0.02em;
  border: 1px solid var(--fg);
  border-radius: 0;
  padding: 1px 7px;
  vertical-align: middle;
  color: var(--fg);
}

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

/* 壓扁特粗明朝（EVA 標題字的近似）：Noto Serif TC 900 水平壓扁。--k 壓扁比例、
   --n 未壓扁寬度（em），由 src/lib/squash.ts 產生；margin-right 把壓扁後多出的版面寬度收回。 */
.sq {
  font-family: var(--serif); font-weight: 900; display: inline-block;
  line-height: .95; letter-spacing: -.03em; white-space: nowrap;
  transform-origin: left bottom; transform: scaleX(var(--k, .7));
  margin-right: calc((var(--k, .7) - 1) * var(--n, 0) * .97em);
}

/* 黑標題卡：只包住字，不撐滿寬。左側直排朱紅小字，右側兩行大小對比的壓扁字。 */
.tcard {
  display: inline-grid; grid-template-columns: auto auto; gap: 0 10px; align-items: end;
  padding: 16px 18px 14px; max-width: 100%;
  background: var(--block-bg); color: var(--block-fg);
}
a.tcard:hover .tcard-l1, a.tcard:focus-visible .tcard-l1 { text-decoration: underline; text-decoration-thickness: 3px; text-underline-offset: 6px; }
.tcard-v {
  writing-mode: vertical-rl; text-orientation: upright;
  font-family: var(--serif); font-weight: 900; font-size: 14px; letter-spacing: .12em; line-height: 1;
  color: var(--block-accent);
}
.tcard-body { margin: 0; font: inherit; letter-spacing: 0; }
.tcard-line { display: block; }
.tcard-line + .tcard-line { margin-top: 2px; }

/* 章節標：黑塊＋延伸到欄寬的粗線。語意仍是 h2（或 h3）。 */
.sh { display: flex; align-items: center; margin: 48px 0 16px; font-size: 26px; line-height: 1; }
.sh-text { flex: none; background: var(--block-bg); color: var(--block-fg); padding: 5px 12px 3px; }
.sh::after { content: ""; flex: 1; border-top: 4px solid var(--fg); }

/* 頭像：報紙常見的直式方框（4:5）。無照片時同尺寸淺灰方框＋姓氏。 */
.ph-box {
  width: 36px; height: 45px; flex: none; display: block;
  object-fit: cover; object-position: center top; background: var(--row-hover);
}
.ph-box.ph {
  display: grid; place-items: center;
  font-family: var(--serif); font-weight: 900; color: var(--faint); font-size: 17px;
}
```

同檔把 `:focus-visible` 的 `border-radius: 4px;` 刪掉、`.skip-link` 的 `border-radius: 6px;` 改 `border-radius: 0;`。

- [ ] **Step 4: theme-color**（`src/layouts/Base.astro:31`）

```astro
    <meta name="theme-color" content="#ffffff" />
```

- [ ] **Step 5: 驗證**

Run: `pnpm exec astro check 2>&1 | grep -E "^- [0-9]+ error"` → Expected: `- 12 errors`
Run: `pnpm exec vitest run` → Expected: 全過
Run: `pnpm exec astro build` → Expected: `Complete!`

- [ ] **Step 6: Commit**

```bash
git add src/styles/tokens.css src/layouts/Base.astro
git commit -m "feat(style): 白底墨黑色票與壓扁字、標題卡、章節標、方框頭像等全域樣式"
```

---

### Task 3: 報頭、導覽、頁尾

**Files:**
- Modify: `src/layouts/Base.astro`（`<header class="site-head">` 整段、`<footer class="site-foot">` 整段、對應 `<style>`）

**Interfaces:**
- Consumes: `squashStyle`/`fitStyle`（Task 1）、`.sq`（Task 2）
- Produces: 首頁時報頭站名是 `<h1>`；其他頁不是。導覽目前頁加 `aria-current="page"`。

- [ ] **Step 1: frontmatter 加變數**（`Base.astro` 的 `---` 區內、`dataDate` 之後）

```ts
import { fitStyle } from "../lib/squash";
const SITE_NAME = "政治人物背景資料庫";
const path = Astro.url.pathname;
const isHome = path === "/";
// 導覽順序依改版 spec：總覽／九合一選舉／政治獻金／關係圖／關於。
const NAV = [
  { href: "/", label: "總覽", match: (p: string) => p === "/" },
  { href: "/elections/", label: "九合一選舉", match: (p: string) => p.startsWith("/elections") },
  { href: "/donors/", label: "政治獻金", match: (p: string) => p.startsWith("/donors") },
  { href: "/graph/", label: "關係圖", match: (p: string) => p.startsWith("/graph") },
  { href: "/about/", label: "關於", match: (p: string) => p.startsWith("/about") },
];
// 報頭站名：桌機 52px，窄螢幕依視窗寬度縮字（扣掉左右槽寬 48px 與切換鈕 46px）。
const mastStyle = fitStyle(SITE_NAME, 0.7, 52, 94);
```

（`fitStyle` 在 Task 1 已定義：`fitStyle(text, k, maxPx, reservePx)`。）

- [ ] **Step 2: 換掉 `<header class="site-head">…</header>`**

```astro
    <header class="site-head wrap">
      <div class="mast">
        {isHome
          ? <h1 class="mast-name"><span class="sq" style={mastStyle}>{SITE_NAME}</span></h1>
          : <a href="/" class="mast-name" aria-label="回首頁"><span class="sq" style={mastStyle}>{SITE_NAME}</span></a>}
        <div class="mast-side">
          <p class="mast-date">
            <span id="mast-today" hidden></span>
            {dataDate && <span>資料更新 {dataDate}</span>}
          </p>
          <button id="theme-toggle" type="button" class="toggle" aria-label="切換深色或淺色模式">
            （保留原本兩個 svg，內容不變）
          </button>
        </div>
      </div>
      <nav class="nav" aria-label="主選單">
        {NAV.map((n) => <a href={n.href} aria-current={n.match(path) ? "page" : undefined}>{n.label}</a>)}
      </nav>
    </header>
```

`（保留原本兩個 svg…）` 這行要換成 `Base.astro` 現有的 `<svg class="ic-sun">…</svg>` 與 `<svg class="ic-moon">…</svg>` 原文。

- [ ] **Step 3: 報頭日期由瀏覽器端填**（接在既有 `theme-toggle` 的 `<script is:inline>` 裡、同一個 script 內最後面）

```js
      // 報頭日期：靜態頁不能用建置日當「今天」，在瀏覽器端填；無 JS 時不顯示。
      const td = document.getElementById("mast-today");
      if (td) {
        td.textContent = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date());
        td.hidden = false;
      }
```

- [ ] **Step 4: 換掉 `<footer class="site-foot">…</footer>`**（保留三段文字內容，`foot-meta` 拿掉「資料更新」——已移到報頭）

```astro
    <footer class="site-foot wrap">
      <p class="disc">本站非官方網站，僅彙整公開資料並標註出處。判決與爭議資訊不代表最終定罪，未定讞前當事人受無罪推定保障；爭議報導未經逐筆查核，以官方資料為準。</p>
      <p class="foot-src">資料來源：立法院開放資料、中央選舉委員會、司法院裁判書系統、監察院公職人員財產申報、維基百科</p>
      <p class="foot-meta">
        <a href="/about/">關於與免責</a>
        <a href="/about/#correction">更正</a>
        <a href="https://github.com/weryk153/legislator-background/issues" target="_blank" rel="noopener">回報問題</a>
      </p>
    </footer>
```

- [ ] **Step 5: 換掉 `<style>` 內 `.site-head` 到 `.nav a:hover`、`@media (max-width: 560px)`、`.toggle`、`.site-foot` 到 `.foot-meta a:hover` 的規則**（`.ic-moon`、`.main` 規則保留）

```css
      .site-head { padding-top: 28px; }
      .mast { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding-bottom: 10px; border-bottom: 4px solid var(--fg); }
      .mast-name { margin: 0; font-size: inherit; line-height: 1; }
      a.mast-name:hover .sq { text-decoration: underline; text-decoration-thickness: 3px; }
      .mast-side { display: flex; align-items: flex-end; gap: 12px; }
      .mast-date { margin: 0; font-size: var(--t-xs); color: var(--muted); text-align: right; line-height: 1.5; display: flex; flex-direction: column; }
      .nav { display: flex; flex-wrap: wrap; gap: 6px 26px; padding: 8px 0; border-bottom: 1px solid var(--fg); font-size: 0.875rem; font-weight: 600; }
      .nav a { color: var(--muted); }
      .nav a:hover, .nav a[aria-current="page"] { color: var(--fg); }
      .nav a[aria-current="page"] { box-shadow: inset 0 -2px 0 var(--fg); }
      .toggle {
        display: inline-flex; align-items: center; justify-content: center;
        width: 34px; height: 34px; padding: 0; flex: none;
        background: none; border: 1px solid var(--fg); border-radius: 0;
        color: var(--fg); cursor: pointer;
      }
      .toggle:hover { background: var(--fg); color: var(--bg); }
      @media (max-width: 560px) {
        .mast-date { display: none; }
        .nav { gap: 6px 16px; }
      }
      .site-foot { margin-top: 24px; padding-top: 16px; padding-bottom: 48px; border-top: 4px solid var(--fg); font-size: var(--t-sm); color: var(--muted); line-height: 1.7; }
      .site-foot p { margin: 0; max-width: 72ch; }
      .disc { margin-bottom: 8px; }
      .foot-src { color: var(--faint); font-size: var(--t-xs); margin-bottom: 12px; }
      .foot-meta { display: flex; flex-wrap: wrap; gap: 6px 18px; }
      .foot-meta a { color: var(--fg); text-decoration: underline; text-underline-offset: 2px; }
```

注意：`.site-foot` 現在自己帶 `.wrap`，粗線會與內容同寬（mock v2 曾出現頁尾比內容寬的 bug，原因是覆寫了 `.wrap` 的左右 padding——這裡只設上下 padding）。

- [ ] **Step 6: 驗證**

Run: `pnpm exec astro build && cd dist && python3 -m http.server 4399`（背景）→ 開 `http://localhost:4399/` 與 `/about/`：
- 首頁報頭字是 `<h1>`，/about/ 報頭是連結（DevTools 檢查）。
- 導覽「關於」在 /about/ 有底線。
- 390px 寬時站名不溢出、導覽可換行。
- 報頭日期顯示今天（瀏覽器端）。
Run: `pnpm exec tsx scraper/scripts/seo-headings.ts --check .superpowers/seo-baseline.json` → Expected：只有 `/` 的 h1 會因為頁面內原本的「看見政治人物的背景」h1 還在而報 `["政治人物背景資料庫","看見政治人物的背景"]`——Task 5 會移除，這裡可接受。

- [ ] **Step 7: Commit**

```bash
git add src/layouts/Base.astro
git commit -m "feat(layout): 報紙報頭（全名壓扁特粗）、導覽目前頁標示、粗線頁尾"
```

---

### Task 4: TitleCard 與 SectionHead 元件

**Files:**
- Create: `src/components/TitleCard.astro`
- Create: `src/components/SectionHead.astro`

**Interfaces:**
- Consumes: `fitStyle`、`squashStyle`（Task 1）；`.tcard*`、`.sh*`、`.sq`、`.sr-only`（Task 2）
- Produces:
  - `<TitleCard vertical: string, lines: [string] | [string, string], heading?: string, as?: 'h1' | 'h2' (預設 'h1'), href?: string />`
    - 不給 `heading`：標題元素（`as`）就是兩行大字本身，`textContent` = `lines.join('')`。
    - 給 `heading`：兩行大字 `aria-hidden`，另以 `<as class="sr-only">{heading}</as>` 保留語意標題（SEO 字串不變）。
    - 直排字一律在標題元素外、`aria-hidden`，不會混進 `<h1>` 文字。
  - `<SectionHead text: string, id?: string, level?: 2 | 3 (預設 2) />`

- [ ] **Step 1: TitleCard**

```astro
---
// 黑標題卡（EVA 標題卡構圖）：左側直排朱紅小字，右側兩行大小對比的壓扁字。
// 語意標題與視覺字串不同時（縣市頁、個人頁的 h1 字串為 SEO 調過，不能改），
// 視覺字串 aria-hidden、語意標題以 sr-only 保留。直排字永遠在標題元素外。
import { fitStyle } from "../lib/squash";

interface Props {
  vertical: string;
  lines: [string] | [string, string];
  heading?: string;
  as?: "h1" | "h2";
  href?: string;
}
const { vertical, lines, heading, as: Tag = "h1", href } = Astro.props;
// 大字 84px／小字 38px，壓扁 .62；窄螢幕扣掉槽寬 48、卡片內距 36、直排欄 24＋間距 10 ≈ 120px 後依寬度縮字。
const l1 = fitStyle(lines[0], 0.62, 84, 120);
const l2 = lines[1] ? fitStyle(lines[1], 0.62, 38, 120) : null;
const Wrap = href ? "a" : "div";
---
<Wrap class="tcard" href={href}>
  <span class="tcard-v" aria-hidden="true">{vertical}</span>
  {heading ? (
    <>
      <span class="tcard-body" aria-hidden="true">
        <span class="tcard-line"><span class="sq tcard-l1" style={l1}>{lines[0]}</span></span>
        {l2 && <span class="tcard-line"><span class="sq tcard-l2" style={l2}>{lines[1]}</span></span>}
      </span>
      <Tag class="sr-only">{heading}</Tag>
    </>
  ) : (
    <Tag class="tcard-body">
      <span class="tcard-line"><span class="sq tcard-l1" style={l1}>{lines[0]}</span></span>
      {l2 && <span class="tcard-line"><span class="sq tcard-l2" style={l2}>{lines[1]}</span></span>}
    </Tag>
  )}
</Wrap>
```

- [ ] **Step 2: SectionHead**

```astro
---
// 章節標：黑塊（壓扁字）＋延伸到欄寬的粗線。取代各頁原本的 h2 樣式。
import { squashStyle } from "../lib/squash";

interface Props { text: string; id?: string; level?: 2 | 3 }
const { text, id, level = 2 } = Astro.props;
const Tag = level === 3 ? "h3" : "h2";
---
<Tag class="sh" id={id}><span class="sh-text"><span class="sq" style={squashStyle(text)}>{text}</span></span></Tag>
```

- [ ] **Step 3: 驗證**（元件還沒被用到，只確認型別）

Run: `pnpm exec astro check 2>&1 | grep -E "^- [0-9]+ error"` → Expected: `- 12 errors`

- [ ] **Step 4: Commit**

```bash
git add src/components/TitleCard.astro src/components/SectionHead.astro
git commit -m "feat(components): 黑標題卡與章節標元件"
```

---

### Task 5: 時程軸元件＋首頁

**Files:**
- Create: `src/components/ElectionTimeline.astro`
- Modify: `src/pages/elections.astro`（移除時程軸 frontmatter、markup、`<script>`、`.timeline`/`.tl-*` 樣式，改用元件）
- Modify: `src/pages/index.astro`
- Modify: `src/components/OfficialTable.svelte`

**Interfaces:**
- Consumes: `TitleCard`、`SectionHead`（Task 4）；`squashStyle`（Task 1）；`.ph-box`（Task 2）；`ELECTION_MILESTONES`、`taipeiToday`、`timelineProgress`（`src/lib/candidateTypes.ts`，既有）
- Produces: `<ElectionTimeline />`（無 props）

- [ ] **Step 1: 建 `ElectionTimeline.astro`**——把 `src/pages/elections.astro` 中下列內容**原樣搬入**：
  - frontmatter 的「選務時程軸」區塊：`today`、`progress`、`shortDate`、`TimelineItem`、`timelineItems`、`SR_STATE`（連同註解）；import `ELECTION_MILESTONES, taipeiToday, timelineProgress` from `"../lib/candidateTypes"`。
  - markup：`<ol class="timeline">…</ol>` 整段（不含外層 `<section>`、`<h2>`、`.overview-note`）。
  - 頁尾的 `<script>`（時程軸換日），把 import 路徑由 `"../lib/candidateTypes"` 維持不變（同層級）。
  - `<style>` 內 `.timeline` 到 `@media (max-width: 640px) {…}` 的時程軸規則，並做以下改動：
    - `.timeline::before` 的 `border-top: 1px solid var(--line-strong)` → `var(--fg)`
    - `.tl-today[hidden] { display: none; }` 保留
    - 640px 以下直排規則保留

- [ ] **Step 2: elections.astro 改用元件**

```astro
import ElectionTimeline from "../components/ElectionTimeline.astro";
```

把原本 `<ol class="timeline">…</ol>` 換成 `<ElectionTimeline />`，刪除已搬走的 frontmatter、script、樣式。若 `taipeiToday`、`timelineProgress`、`ELECTION_MILESTONES` 在 elections.astro 已無其他用處，從 import 移除。

- [ ] **Step 3: 驗證時程軸搬家沒壞**

Run: `pnpm exec vitest run test/electionTimeline.test.ts && pnpm exec astro build`
Expected: PASS、`Complete!`
再用 Task 3 的 4399 預覽開 `/elections/`，DevTools console 執行：
```js
[...document.querySelectorAll('.timeline > li')].map(li => li.className + (li.hidden ? '[hidden]' : '') + ' | ' + li.innerText.replace(/\n/g, ' '))
```
Expected：「今天」在「候選人登記」之後、日期為今天。

- [ ] **Step 4: 首頁**（`src/pages/index.astro`，取代 `<section class="intro">…</section>` 與 `<style>`）

```astro
---
// （frontmatter 既有內容保留，加上：）
import TitleCard from "../components/TitleCard.astro";
import SectionHead from "../components/SectionHead.astro";
import ElectionTimeline from "../components/ElectionTimeline.astro";
---
  <section class="lead">
    <TitleCard as="h2" vertical="第壱話" lines={["九合一", "候選人背景總整理"]} href="/elections/" />
    <div class="lead-text">
      <p>2026 縣市長與縣市議員參選人的經歷、判決、爭議與政治獻金，逐縣市整理。</p>
      <a class="go" href="/elections/">看選舉頁 →</a>
    </div>
  </section>

  <SectionHead text="選務時程" />
  <ElectionTimeline />

  <SectionHead text="名冊" />
  <p class="term-note">收錄對象：第11屆立法委員（2024年當選）、2022年當選之縣市首長與縣市議員（任期至2026）。任內已解職者保留並標註「已解職」。</p>
  <OfficialTable client:load rows={rows} />
  <style>
    .lead { display: flex; gap: 28px; align-items: flex-end; margin: 36px 0 0; }
    .lead-text p { margin: 0; max-width: 30em; color: var(--muted); }
    .go { display: inline-block; margin-top: 10px; font-weight: 700; border-bottom: 2px solid var(--fg); }
    .term-note { margin: 0 0 14px; font-size: var(--t-sm); color: var(--faint); max-width: 64ch; line-height: 1.6; }
    @media (max-width: 640px) { .lead { flex-direction: column; align-items: flex-start; gap: 14px; } }
  </style>
```

（首頁原本的 `<h1>看見政治人物的背景</h1>` 與 `.lede` 一併移除——報頭站名已是首頁 h1，見 spec §2.3。）

- [ ] **Step 5: OfficialTable 列樣式**（`src/components/OfficialTable.svelte`）

`<script>` 加：
```ts
  import { squashStyle } from '../lib/squash';
```

頭像與姓名 markup（取代 `{#if r.photoUrl}…{/if}` 與 `.name` 那行）：
```svelte
      {#if r.photoUrl}
        <img class="ph-box" src={r.photoUrl} alt="" loading="lazy" width="36" height="45" />
      {:else}
        <span class="ph-box ph" aria-hidden="true">{r.name[0]}</span>
      {/if}
      <div class="who-text">
        <div class="name"><span class="sq" style={squashStyle(r.name, 0.8)}>{r.name}</span></div>
        <div class="office">{r.party}・{r.district}・{officeName[r.officeType]}{#if r.departed}<span class="departed">・已解職</span>{/if}</div>
      </div>
```

`<style>` 改動：
- `.ctrl`：`border: 1px solid var(--fg); border-radius: 0; background: transparent;`，hover 改 `border-color: var(--fg); box-shadow: inset 0 0 0 1px var(--fg);`
- `.thead`：`border-bottom: 1px solid var(--fg);`
- 刪除 `.avatar`、`.avatar.ph`、`.row:hover .avatar`、`.name .meta` 規則
- `.name { font-size: 19px; line-height: 1.1; }`
- `.office { font-size: 0.75rem; color: var(--muted); margin-top: 4px; }`、`.office .departed { color: var(--accent); }`
- `.v { font-family: var(--serif); font-size: 18px; font-weight: 700; }`；`.v.dim { color: var(--faint); font-weight: 400; }`；`.v.accent` 規則刪除（判決數字改同色，只有 0 變淡——中立原則：筆數同色只列數字）
- `.asset { font-size: 0.8125rem; font-weight: 400; color: var(--muted); }`
- 手機 `@media (max-width: 560px)` 內刪除 `.name .meta` 那條

markup 中 `class:accent={r.judgmentCount > 0}`、`class:accent={r.controversyCount > 0}` 一併移除。

- [ ] **Step 6: 驗證**

Run: `pnpm exec vitest run && pnpm exec astro check 2>&1 | grep -E "^- [0-9]+ error" && pnpm exec astro build`
Expected: 全過、`- 12 errors`、`Complete!`
Run: `pnpm exec tsx scraper/scripts/seo-headings.ts --check .superpowers/seo-baseline.json`
Expected: `頁 title／h1 與基準一致`（首頁 h1 現在只剩報頭）
4399 預覽首頁對照 `full-home-v3.html`：桌機 1440、手機 390 各截一張；深色模式切換後黑卡反轉為白底黑字。

- [ ] **Step 7: Commit**

```bash
git add src/components/ElectionTimeline.astro src/pages/elections.astro src/pages/index.astro src/components/OfficialTable.svelte
git commit -m "feat(home): 首頁頭條標題卡、選務時程、名冊報紙化；時程軸抽成共用元件"
```

---

### Task 6: 縣市長候選人卡片 D1

**Files:**
- Modify: `src/components/ChiefRaceCard.astro`

**Interfaces:**
- Consumes: `squashStyle`（Task 1）、`.ph-box`（Task 2）
- Produces: 同一個元件 props 不變（`race`、`officialsBySlug`、`href?`、`showHead?`）；/elections 六都卡片與縣市頁共用。

- [ ] **Step 1: markup**——`<ul class="cc-cands">` 內每個 `<li class="mc">` 改為：

```astro
        <li class="mc">
          {photo
            ? <img class="ph-box mc-photo" src={photo} alt="" width="56" height="70" loading="lazy" />
            : <span class="ph-box ph mc-photo" aria-hidden="true">{c.name[0]}</span>}
          <div class="mc-body">
            <p class="mc-name">
              {c.number !== null && <span class="mc-no">{c.number} 號</span>}
              {c.slug
                ? <a href={`/officials/${c.slug}/`} class="sq" style={squashStyle(c.name, 0.78)}>{c.name}</a>
                : <span class="sq" style={squashStyle(c.name, 0.78)}>{c.name}</span>}
              {isChiefReelect(c, r) && <span class="mc-tag">爭取連任</span>}
            </p>
            <p class="mc-party"><span class="dot" style={`background: var(${partyColorVar(c)});`} aria-hidden="true"></span>{partyLabel(c)}</p>
            {c.identity && <p class="mc-id">{c.identity}</p>}
            <p class="mc-recs">
              {n ? `經歷 ${n.careers}・判決 ${n.judgments}・爭議 ${n.controversies}・獻金 ${n.donations}` : "本站尚無檔案"}
            </p>
          </div>
        </li>
```

frontmatter 加 `import { squashStyle } from "../lib/squash";`。

- [ ] **Step 2: 樣式**——`<style>` 內 `.cc-cands` 到 `.mc-recs` 規則換成：

```css
  .cc-cands { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--fg); }
  .mc { display: flex; gap: 14px; padding: 14px 18px 14px 0; border-bottom: 1px solid var(--line); min-width: 0; }
  .mc:nth-child(even) { padding-left: 18px; padding-right: 0; border-left: 1px solid var(--line); }
  .mc-photo { width: 56px; height: 70px; }
  .mc-photo.ph { font-size: 24px; }
  .mc-body { min-width: 0; }
  .mc-body p { margin: 0; line-height: 1.6; }
  .mc-name { font-size: 22px; line-height: 1.1 !important; margin-bottom: 4px !important; }
  .mc-name a:hover { text-decoration: underline; text-decoration-thickness: 2px; }
  .mc-no { font-family: var(--sans); font-weight: 400; font-size: var(--t-sm); color: var(--muted); margin-right: 6px; }
  .mc-tag { display: inline-block; margin-left: 8px; padding: 0 6px; font-family: var(--sans); font-weight: 400; font-size: var(--t-xs); line-height: 1.6; color: var(--fg); border: 1px solid var(--fg); vertical-align: 4px; }
  .mc-party, .mc-id { font-size: 0.8125rem; }
  .mc-id { color: var(--muted); }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; vertical-align: 1px; }
  .mc-recs { font-size: var(--t-sm); color: var(--muted); font-variant-numeric: tabular-nums; }
  @media (max-width: 640px) {
    .cc-cands { grid-template-columns: 1fr; }
    .mc:nth-child(even) { padding-left: 0; border-left: 0; }
  }
```

`.chief-card` 的 `border-top` 刪除（上緣黑線改由 `.cc-cands` 提供）；`.cc-head h3` 改 `font-family: var(--serif); font-weight: 900; font-size: var(--t-md);`。

- [ ] **Step 3: 驗證**

Run: `pnpm exec astro build`；4399 預覽 `/elections/2026/penghu/`（6 人，3 張照片）與 `/elections/2026/taipei/`：
- 兩欄、欄間直線、方框照片、無照片者顯示姓氏方框。
- 390px 寬時改單欄。
- 照片署名列仍在卡片底部。

- [ ] **Step 4: Commit**

```bash
git add src/components/ChiefRaceCard.astro
git commit -m "feat(elections): 縣市長候選人卡片改兩欄人物欄（直式方框照片、壓扁姓名）"
```

---

### Task 7: 縣市選舉頁

**Files:**
- Modify: `src/pages/elections/2026/[county].astro`

**Interfaces:**
- Consumes: `TitleCard`、`SectionHead`（Task 4）；`countyPageHeading`（`src/lib/countyPage.ts`，既有）；`chiefTitle`（既有）

- [ ] **Step 1: 標題卡**——取代 `<header class="head"><h1>…</h1>…</header>`：

```astro
  <header class="head">
    <TitleCard vertical="二〇二六" lines={[name, `${name.endsWith("市") ? "市" : "縣"}長・議員選舉`]} heading={countyPageHeading(name)} />
    <p class="status">
      本站名單目前為：<a href={dataSource.url} rel="noopener">{STAGE_LABEL[dataSource.stage]}</a>（製表 {dataSource.tableDate}），名單會隨選務進度更新。
    </p>
  </header>
```

第二行得到「縣長・議員選舉」或「市長・議員選舉」；`<h1>` 以 `sr-only` 保留 `countyPageHeading(name)` 原字串。

frontmatter 加 `import TitleCard from "../../../components/TitleCard.astro"; import SectionHead from "../../../components/SectionHead.astro";`

- [ ] **Step 2: 章節標**——三個 h2 換成：

```astro
    <SectionHead id="chief-title" text={`${chief}候選人`} />
    …
      <SectionHead id="council-title" text={`${name}議員候選人`} />
    …
    <SectionHead id="others-title" text="其他縣市" />
```

（`aria-labelledby` 引用的 id 不變。）

- [ ] **Step 3: 樣式**——`<style>` 內：
- 刪除 `.head h1`、`.sec h2`、`.others h2`。
- `.head { margin: 14px 0 0; display: flex; gap: 24px; align-items: flex-end; flex-wrap: wrap; }`；`.status { max-width: 32em; }`
- `.district:first-of-type { border-top: 1px solid var(--fg); }`
- `.d-label { font-weight: 900; }`
- `.note.mapping { border-left: 2px solid var(--fg); }`
- 目前縣市：`.county-links [aria-current="page"] { background: var(--block-bg); color: var(--block-fg); padding: 0 6px; font-weight: 700; }`

- [ ] **Step 4: 驗證**

Run: `pnpm exec astro build && pnpm exec tsx scraper/scripts/seo-headings.ts --check .superpowers/seo-baseline.json`
Expected: 一致（縣市頁 h1 仍是「2026 澎湖縣長與澎湖縣議員選舉候選人」）。
4399 預覽 `/elections/2026/penghu/` 對照 `full-county-v3.html`；`/elections/2026/new-taipei/`（長名單）手機 390 截圖。

- [ ] **Step 5: Commit**

```bash
git add "src/pages/elections/2026/[county].astro"
git commit -m "feat(elections): 縣市選舉頁改標題卡與章節標"
```

---

### Task 8: 選舉總覽頁與 ElectionPanel 報頭

**Files:**
- Modify: `src/pages/elections.astro`
- Modify: `src/components/ElectionPanel.svelte:166-174`（masthead）與 `.masthead h1` 樣式

**Interfaces:**
- Consumes: `SectionHead`（Task 4）；`.tcard*`、`.sq`（Task 2）；`squashStyle`（Task 1）

- [ ] **Step 1: ElectionPanel masthead 改標題卡樣式**（h1 文字內容維持「{DEFAULT_YEAR}九合一選舉」）

```svelte
    <h1 class="tcard ep-card">
      <span class="tcard-v masthead-year">{DEFAULT_YEAR}</span>
      <span class="tcard-body"><span class="tcard-line"><span class="sq masthead-theme" style={squashStyle('九合一選舉', 0.62)}>九合一選舉</span></span></span>
    </h1>
```

`<script>` 加 `import { squashStyle } from '../lib/squash';`。
樣式：刪除 `.masthead h1`、`.masthead h1 span`、`.masthead h1 .masthead-theme` 三條，改為：

```css
  .masthead .ep-card { margin: 0; }
  .masthead .ep-card .masthead-theme { font-size: 52px; }
  .masthead .ep-card .masthead-year { font-size: 15px; }
```

`.masthead .rule-thick` 的 `border-top: 2px solid var(--line-strong)` → `4px solid var(--fg)`。

- [ ] **Step 2: elections.astro 章節標**——`timeline-title`、`stats-title`、`muni-title`、`cand-title`、`council-title` 五個 h2 換成 `<SectionHead id="…" text="…" />`（文字同原 h2）；`<h3>各黨提名人數・{g.title}</h3>` 換成 `<h3 class="bar-title">各黨提名人數・{g.title}</h3>` 並在樣式加 `.bar-title { font-family: var(--serif); font-weight: 900; font-size: 1rem; margin: 0 0 8px; }`。frontmatter 加 `import SectionHead from "../components/SectionHead.astro";`。

- [ ] **Step 3: elections.astro 樣式**
- 刪除 `.overview h2`（或同等 h2 規則）。
- `.tile { border-top: 1px solid var(--fg); }`
- `.cand-table` 的表頭：`thead th { border-bottom: 1px solid var(--fg); }`
- `details.council summary` 的 border（若有）改 `var(--line)`；`.council-name { font-family: var(--serif); font-weight: 900; }`
- `.sr-only` 本地定義刪除（已在 tokens.css 全域）。

- [ ] **Step 4: 驗證**

Run: `pnpm exec astro build && pnpm exec tsx scraper/scripts/seo-headings.ts --check .superpowers/seo-baseline.json`
Expected: 一致（/elections/ 與 /elections/2022/ 的 h1 文字仍是「2026 九合一選舉」「2022 九合一選舉」——空白由抽取函式正規化）。
4399 預覽 `/elections/`：地圖左欄報頭是黑卡、年份直排朱紅；地圖本身著色不變；版次切換仍可用；1568×766 視窗下左欄內容不被切（ElectionPanel 註解提過這個尺寸）。

- [ ] **Step 5: Commit**

```bash
git add src/pages/elections.astro src/components/ElectionPanel.svelte
git commit -m "feat(elections): 選舉總覽頁章節標與地圖報頭標題卡"
```

---

### Task 9: 個人頁

**Files:**
- Modify: `src/pages/officials/[id].astro`

**Interfaces:**
- Consumes: `TitleCard`、`SectionHead`（Task 4）；頁面既有變數 `o`、`roleText`、`isCandidate`、`candidacy`、`candidacyHref`

- [ ] **Step 1: 頁首**——`<header class="head">` 內 `<h1>{o.name}</h1>` 換成：

```astro
    <TitleCard vertical={o.party} lines={[o.name, roleText]} heading={o.name} />
```

pills（職位、已解職、參選標記）移到 `TitleCard` 之後同一列：把三個 pill 包進 `<div class="pills">…</div>` 並放在 TitleCard 後面。`.lede` 保留。

- [ ] **Step 2: 章節標**——`經歷`、`司法判決`、`相關爭議報導`、`財產申報`、`政治獻金`、`人物關係` 六個 `<h2>` 換成 `<SectionHead text="…" />`。

- [ ] **Step 3: 樣式**
- 刪除 `.head h1`、`.sec h2`。
- `.head { margin: 14px 0 28px; }`；`.pills { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 6px; }`
- `.pill.departed { color: var(--accent); border-color: var(--accent); }`、`.departed-note { color: var(--accent); }`（原本寫死 `#b3261e`）
- `.career-group-head { border-bottom: 1px solid var(--fg); }`
- `a.pill.candidacy:hover { background: var(--fg); color: var(--bg); }`

- [ ] **Step 4: 驗證**

Run: `pnpm exec astro build && pnpm exec tsx scraper/scripts/seo-headings.ts --check .superpowers/seo-baseline.json`
Expected: 一致（個人頁 h1 仍是姓名）。
4399 預覽：`/officials/cand-周倪安-澎湖縣/`（參選人，roleText 短）、一位全國不分區立委（roleText 長，如 `/officials/kuo-yu-ching/`）手機 390 截圖——小字自動縮小、不溢出。

- [ ] **Step 5: Commit**

```bash
git add "src/pages/officials/[id].astro"
git commit -m "feat(officials): 個人頁標題卡（直排黨籍）與章節標"
```

---

### Task 10: 其餘頁面與元件直角化

**Files:**
- Modify: `src/pages/donors.astro`、`src/pages/graph.astro`、`src/pages/about.astro`、`src/pages/404.astro`、`src/pages/elections/2022.astro`
- Modify: `src/components/DonorSearch.svelte`、`src/components/RelationshipGraph.svelte`、`src/components/ElectionMap.svelte:948`、`src/components/ElectionSidebar.svelte:350-357`

**Interfaces:**
- Consumes: `TitleCard`、`SectionHead`（Task 4）

- [ ] **Step 1: 標題卡**（標題元素文字 = `lines.join('')`，與原 h1 相同，不需 `heading`）

| 檔案 | 取代 | 換成 |
|---|---|---|
| `donors.astro` | `<h1>政治獻金查詢</h1>` | `<TitleCard vertical="監察院資料" lines={["政治獻金", "查詢"]} />` |
| `graph.astro` | `<h1>人物關係圖</h1>` | `<TitleCard vertical="公開資料" lines={["人物", "關係圖"]} />` |
| `about.astro` | `<span class="kicker">About</span>` 與 `<h1>關於本站</h1>` | `<TitleCard vertical="說明" lines={["關於", "本站"]} />` |
| `404.astro` | `<span class="kicker">404</span>` 與 `<h1>找不到這個頁面</h1>` | `<TitleCard vertical="404" lines={["找不到", "這個頁面"]} />` |

各檔 frontmatter 加對應 import（`../components/TitleCard.astro`）；刪除各檔 `.head h1`／`.nf h1` 規則。

- [ ] **Step 2: 章節標**
- `about.astro`：七個 `<h2>` 換成 `<SectionHead text="…" />`（文字同原 h2），刪除 `.sec h2` 規則。
- `graph.astro`：`<h2>圖中人物清單</h2>` → `<SectionHead text="圖中人物清單" />`
- `2022.astro`：`<h2 class="table-title">全國一覽：2022 年九合一選舉結果</h2>` → `<SectionHead text="全國一覽：2022 年九合一選舉結果" />`，刪除 `.table-title` 與本地 `.sr-only` 規則。

- [ ] **Step 3: 直角化**
- `DonorSearch.svelte` `.controls .ctrl`：`border-radius: 0; border-color: var(--fg); background: transparent;`；`.ctrl`（大搜尋框）`border: 1px solid var(--fg);`；`h2 { font-family: var(--serif); font-weight: 900; }`
- `RelationshipGraph.svelte:288/298/308`：`border-radius: var(--radius)` 已因 `--radius: 0` 生效，確認 `border` 為 `var(--line-strong)`（現為黑）即可，不改節點樣式。
- `graph.astro:65`：同上，`--radius` 已為 0。
- `ElectionMap.svelte:948`：`border-radius: 4px` → `0`（地圖控制鈕；地圖著色不動）。
- `ElectionSidebar.svelte:350/355/357`：`.limit`、提示框、`.tag` 的 `border-radius: 2px` → `0`；`.tag` 邊框改 `var(--fg)`。

- [ ] **Step 4: 驗證**

Run: `pnpm exec astro check 2>&1 | grep -E "^- [0-9]+ error" && pnpm exec vitest run && pnpm exec astro build && pnpm exec tsx scraper/scripts/seo-headings.ts --check .superpowers/seo-baseline.json`
Expected: `- 12 errors`、全過、`Complete!`、一致。

- [ ] **Step 5: Commit**

```bash
git add src/pages/donors.astro src/pages/graph.astro src/pages/about.astro src/pages/404.astro src/pages/elections/2022.astro src/components/DonorSearch.svelte src/components/RelationshipGraph.svelte src/components/ElectionMap.svelte src/components/ElectionSidebar.svelte
git commit -m "feat(style): 獻金、關係圖、關於、2022、404 頁改標題卡與章節標，控制項直角化"
```

---

### Task 11: 全站驗收

**Files:** 無（只驗證；發現問題回到對應 Task 修正並另行 commit）

- [ ] **Step 1: 自動檢查**

Run:
```bash
pnpm exec astro check 2>&1 | grep -E "^- [0-9]+ error"
pnpm exec vitest run
pnpm exec astro build
pnpm exec tsx scraper/scripts/seo-headings.ts --check .superpowers/seo-baseline.json
```
Expected：`- 12 errors`；全過；`Complete!`；「頁 title／h1 與基準一致」。

- [ ] **Step 2: 截圖矩陣**（4399 預覽；chrome-devtools `resize_page` + `take_screenshot`；深色用 `localStorage.theme='dark'` 後重整）

頁面：`/`、`/elections/`、`/elections/2026/penghu/`、`/elections/2026/new-taipei/`、`/officials/cand-周倪安-澎湖縣/`、`/officials/kuo-yu-ching/`、`/donors/`、`/graph/`、`/about/`、`/elections/2022/`、`/404.html`
尺寸 × 主題：1440 淺色、1440 深色、390 淺色、390 深色。

逐張確認：
- 黑卡、章節黑塊右側無多餘空白（`.sq` 收寬正確），也沒有吃掉後面的字。
- 390 寬無水平捲動（DevTools：`document.documentElement.scrollWidth <= innerWidth`）。
- 深色模式黑塊反轉為白底黑字、粗線可見。
- 朱紅只出現在：直排小字、時程「今天」、「已解職」。

- [ ] **Step 3: 對比**

DevTools console 於 `/`（淺色與深色各一次）：
```js
const lum = (c) => { const [r,g,b] = c.match(/\d+/g).slice(0,3).map(v => { v/=255; return v<=.03928 ? v/12.92 : ((v+.055)/1.055)**2.4; }); return .2126*r+.7152*g+.0722*b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const bg = getComputedStyle(document.body).backgroundColor;
['--fg','--muted','--faint'].map(v => { const d = document.createElement('span'); d.style.color = `var(${v})`; document.body.append(d); const r = ratio(getComputedStyle(d).color, bg); d.remove(); return [v, r.toFixed(2)]; });
```
Expected：`--muted` ≥ 4.5、`--faint` ≥ 4.5（淺色）；深色 `--faint` 若 < 4.5，調亮 `:root[data-theme="dark"] --faint` 至達標並回 Task 2 commit 修正。

- [ ] **Step 4: 收尾**

- 關掉 4399 預覽（只關自己起的那個）。
- 回報：commit 清單、截圖重點、任何偏離 spec 的地方。

---

## 已知偏離 spec 的地方（實作時照此做）

- **/elections 與 2022 的標題卡**：spec 表格寫「直排 二〇二六／大字 九合一／小字 選舉」，但這兩頁的 h1 在 `ElectionPanel.svelte`，文字是「{年份}九合一選舉」且版次切換時沿用。為了 h1 文字不變，改為直排年份數字（`text-orientation: upright`）＋單行「九合一選舉」（Task 8）。
- **報頭日期**：spec 寫「右日期＋資料更新日」。靜態頁不能把建置日當今天，改由瀏覽器端填入，無 JS 時只顯示資料更新日（Task 3）。
- **判決／爭議數字顏色**：現行首頁名冊把 >0 的數字標朱紅；spec 限定朱紅只用三處，且中立原則要求筆數同色，改為同色、0 變淡（Task 5）。
