# 人物關係圖 維基擴充 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 補上有維基條目的外部人物照片（含授權標示），並以既有外部人物為起點從維基百科擴充關係到 2 度。

**Architecture:** 版控檔案 `scraper/entities-wiki.json` 是外部人物 ↔ 維基條目 ↔ 照片授權的唯一真相（DB entity 重匯即重建，不可存狀態）。所有可測邏輯抽成純函式模組（`scraper/lib/entitiesWiki.ts`、`commonsLicense.ts`、`relEndpoints.ts`、`wikiRelations.ts`），腳本只做 I/O。關係資料一律「腳本產候選 → 人工審定 → 追加 curated → 重匯」，不自動入庫。

**Tech Stack:** Astro 5 + Svelte 5 + Cytoscape.js 3 + Supabase(Postgres) + vitest + sharp + tsx。**不新增依賴。**

**Spec:** `docs/superpowers/specs/2026-08-25-relationship-graph-wiki-expansion-design.md`

## Global Constraints

- **不新增 npm 依賴。**
- 維基 API 一律走 `scraper/lib/fetchPolite.ts` 的 `fetchPolite`（帶 UA、重試）；每次請求間隔 ≥ 500ms。圖片下載自 `upload.wikimedia.org` 會 429，比照 `scraper/enrich-mayor-photos.ts` 退避重試。
- 照片只收 `LicenseShortName` 符合 `/^(CC|Public domain|CC0|PD)/i` 者。
- 照片落地 `public/photos/entities/<name>.jpg`（有 `distinct` 時 `<name>-<distinct 前 8 字>.jpg`），sharp 縮 320px 寬、jpeg quality 80、mozjpeg。
- entity 識別鍵：`name`，或 `name::distinct`（與 import 的 `counterpartDistinct` 規則一致）。
- 對照表與 DB entity 的配對鍵是 `wikipedia_url`，不是姓名。
- 用色只用 `src/styles/tokens.css` 既有 token。
- 註解、commit message 用繁體中文，比照既有風格（`feat(graph): …`、`fix(import): …`、`chore(scraper): …`）。每個 task 結束都 commit。
- 測試指令：`pnpm test`（vitest run；含 `test/**` 與 `scraper/test/**`）。單檔：`pnpm exec vitest run test/xxx.test.ts`。
- 腳本執行：`pnpm exec tsx scraper/xxx.ts`，需要 `.env` 內 `PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`（本地 Supabase，容器跑在 OrbStack）。
- 所有關係、所有對照都要人工審定；「常見名寧缺勿錯」。

## 檔案結構

| 檔案 | 責任 | 動作 |
|---|---|---|
| `scraper/entities-wiki.json` | 外部人物 ↔ 維基條目 ↔ 照片授權對照（人工審定，進版控） | 新增 |
| `scraper/lib/entitiesWiki.ts` | 對照表型別、鍵值、檔名、驗證、載入、索引。純函式＋一個讀檔函式 | 新增 |
| `scraper/lib/commonsLicense.ts` | Commons extmetadata → 授權判定與作者字串。純函式 | 新增 |
| `scraper/wiki-resolve-entities.ts` | 撈 DB entity → 維基搜尋 → 候選對照 JSON | 新增 |
| `scraper/enrich-entity-photos.ts` | 依對照表抓主圖、驗授權、縮圖落地、寫回對照表 | 新增 |
| `scraper/lib/relEndpoints.ts` | curated 列 → 端點解析（subject／counterpart）。純函式 | 新增 |
| `scraper/lib/wikiRelations.ts` | wikitext → infobox 關係欄位、關鍵句候選。純函式 | 新增 |
| `scraper/wiki-discover-relations.ts` | 依對照表抓 wikitext → 候選關係 JSON | 新增 |
| `scraper/import-relationships.ts` | 套對照表、改用 relEndpoints、兩輪匯入、新報告 | 修改 |
| `scraper/export-graph.ts` | 讀對照表組 photoCredit 傳入 buildGraphData | 修改 |
| `src/lib/types.ts` | `GraphNode` 加 `photoCredit?`、`wikipediaUrl?`；`photoUrl` 註解 | 修改 |
| `src/lib/graph.ts` | entity 節點帶 photoUrl / wikipediaUrl / photoCredit | 修改 |
| `src/lib/graphView.ts` | CyNode data 加 description / wikipediaUrl / photoCredit | 修改 |
| `src/components/RelationshipGraph.svelte` | entity 節點 hover tooltip | 修改 |
| `src/pages/about.astro` | 資料來源加一條 | 修改 |
| `package.json` | scripts 加 4 個指令 | 修改 |
| `.gitignore` | 加 `scraper/out-wiki-relations/` | 修改 |
| `test/entitiesWiki.test.ts`、`test/commonsLicense.test.ts`、`test/relEndpoints.test.ts`、`test/wikiRelations.test.ts` | 純函式測試 | 新增 |
| `test/graph.test.ts`、`test/graphView.test.ts` | 補 entity 照片案例 | 修改 |

---

## Stage 1：對照表與照片

### Task 1: 對照表模組 `entitiesWiki.ts` 與空對照表

**Files:**
- Create: `scraper/lib/entitiesWiki.ts`
- Create: `scraper/entities-wiki.json`（內容 `[]`）
- Modify: `.gitignore`（加 `scraper/out-wiki-relations/`）
- Modify: `package.json` scripts
- Test: `test/entitiesWiki.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  ```ts
  export interface EntityPhoto { file: string; author: string; license: string; commonsUrl: string }
  export interface EntityWiki {
    name: string; distinct?: string; wikiTitle: string; wikipediaUrl: string;
    photo?: EntityPhoto; noPhoto?: boolean;
  }
  export function entityWikiKey(name: string, distinct?: string): string          // name 或 name::distinct
  export function photoFileName(name: string, distinct?: string): string          // 柯文哲.jpg / 李傑-學者、鴻海副董.jpg
  export function photoCredit(p: EntityPhoto): string                             // `${author}／${license}`
  export function validateEntitiesWiki(rows: EntityWiki[]): string[]              // 錯誤訊息陣列，空＝合法
  export function indexEntitiesWiki(rows: EntityWiki[]): Map<string, EntityWiki>  // key → row
  export function loadEntitiesWiki(): EntityWiki[]                                // 讀 scraper/entities-wiki.json（I/O）
  export const ENTITIES_WIKI_PATH: string
  ```

- [ ] **Step 1: 寫失敗測試**

建立 `test/entitiesWiki.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  entityWikiKey, photoFileName, photoCredit, validateEntitiesWiki, indexEntitiesWiki,
  ENTITIES_WIKI_PATH, type EntityWiki,
} from '../scraper/lib/entitiesWiki';

const row = (over: Partial<EntityWiki> = {}): EntityWiki => ({
  name: '柯文哲', wikiTitle: '柯文哲',
  wikipediaUrl: 'https://zh.wikipedia.org/wiki/%E6%9F%AF%E6%96%87%E5%93%B2', ...over,
});

describe('entityWikiKey / photoFileName', () => {
  it('無 distinct 只用姓名', () => {
    expect(entityWikiKey('柯文哲')).toBe('柯文哲');
    expect(entityWikiKey('柯文哲', '')).toBe('柯文哲');
    expect(photoFileName('柯文哲')).toBe('柯文哲.jpg');
  });
  it('有 distinct 用 name::distinct；檔名取 distinct 前 8 字', () => {
    expect(entityWikiKey('李傑', '學者、鴻海副董')).toBe('李傑::學者、鴻海副董');
    expect(photoFileName('李傑', '前國防部長、前海軍總司令、海軍上將')).toBe('李傑-前國防部長、前海軍.jpg');
  });
});

describe('photoCredit', () => {
  it('作者／授權', () => {
    expect(photoCredit({ file: '/photos/entities/a.jpg', author: '王小明', license: 'CC BY-SA 4.0', commonsUrl: 'https://commons.wikimedia.org/wiki/File:a.jpg' }))
      .toBe('王小明／CC BY-SA 4.0');
  });
});

describe('validateEntitiesWiki', () => {
  it('合法資料無錯誤', () => {
    expect(validateEntitiesWiki([row()])).toEqual([]);
  });
  it('name+distinct 重複', () => {
    expect(validateEntitiesWiki([row(), row()])).toEqual(['重複鍵：柯文哲']);
  });
  it('wikipediaUrl 必須是 zh.wikipedia.org', () => {
    expect(validateEntitiesWiki([row({ wikipediaUrl: 'https://en.wikipedia.org/wiki/Ko' })]))
      .toEqual(['柯文哲：wikipediaUrl 須為 https://zh.wikipedia.org/wiki/…']);
  });
  it('photo 欄位齊全且 file 指向 /photos/entities/', () => {
    const bad = row({ photo: { file: '/photos/mayors/x.jpg', author: '', license: 'CC BY 4.0', commonsUrl: 'https://commons.wikimedia.org/wiki/File:x.jpg' } });
    expect(validateEntitiesWiki([bad])).toEqual([
      '柯文哲：photo.file 須以 /photos/entities/ 開頭',
      '柯文哲：photo.author 不可為空',
    ]);
  });
  it('photo 與 noPhoto 不可並存', () => {
    const bad = row({ noPhoto: true, photo: { file: '/photos/entities/x.jpg', author: 'a', license: 'CC0', commonsUrl: 'https://commons.wikimedia.org/wiki/File:x.jpg' } });
    expect(validateEntitiesWiki([bad])).toEqual(['柯文哲：photo 與 noPhoto 不可並存']);
  });
});

describe('indexEntitiesWiki', () => {
  it('以鍵索引', () => {
    const idx = indexEntitiesWiki([row(), row({ name: '李傑', distinct: '學者' })]);
    expect(idx.get('柯文哲')?.wikiTitle).toBe('柯文哲');
    expect(idx.get('李傑::學者')?.name).toBe('李傑');
    expect(idx.get('李傑')).toBeUndefined();
  });
});

describe('scraper/entities-wiki.json（實際檔案）', () => {
  it('通過驗證', () => {
    const rows = JSON.parse(readFileSync(ENTITIES_WIKI_PATH, 'utf8')) as EntityWiki[];
    expect(validateEntitiesWiki(rows)).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run test/entitiesWiki.test.ts`
Expected: FAIL，找不到 `../scraper/lib/entitiesWiki`。

- [ ] **Step 3: 實作模組與空對照表**

建立 `scraper/entities-wiki.json`，內容：

```json
[]
```

建立 `scraper/lib/entitiesWiki.ts`：

```ts
// 外部人物 ↔ 維基條目 ↔ 照片授權 對照表（scraper/entities-wiki.json）。
// 這份檔案是唯一真相：import:relationships 每次重跑會把非判決來源的 entity 全部重建
// （新 UUID），任何寫在 DB entities 上的 photo_url / wikipedia_url 重匯即消失，所以
// 照片與條目資訊只能存在版控檔案裡、匯入時套上。
// 見 docs/superpowers/specs/2026-08-25-relationship-graph-wiki-expansion-design.md §2–3。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export interface EntityPhoto {
  file: string;        // 站內路徑，如 /photos/entities/柯文哲.jpg
  author: string;      // Commons extmetadata Artist（去 HTML）
  license: string;     // extmetadata LicenseShortName，如 CC BY-SA 4.0
  commonsUrl: string;  // https://commons.wikimedia.org/wiki/File:…
}
export interface EntityWiki {
  name: string;
  // 同名不同人時填，值須與 relationships-curated.json 該 entity 的 counterpartDistinct 一字不差。
  distinct?: string;
  wikiTitle: string;      // 條目標題（API 用；可能含消歧義括號）
  wikipediaUrl: string;   // https://zh.wikipedia.org/wiki/…（匯入時寫入 entities.wikipedia_url，也是與 DB 列配對的鍵）
  photo?: EntityPhoto;    // 由 enrich:entity-photos 寫入
  noPhoto?: boolean;      // 人工確認主圖不是本人／不宜使用 → 之後跳過不再抓
}

const here = dirname(fileURLToPath(import.meta.url));
export const ENTITIES_WIKI_PATH = join(here, '..', 'entities-wiki.json');
export const PHOTO_DIR_URL = '/photos/entities/';

// entity 識別鍵，與 import-relationships.ts 的 entity 去重快取鍵同規則。
export function entityWikiKey(name: string, distinct?: string): string {
  return distinct ? `${name}::${distinct}` : name;
}

// 檔名用中文，比照 public/photos/councilors/；distinct 只取前 8 個字避免檔名過長。
export function photoFileName(name: string, distinct?: string): string {
  return distinct ? `${name}-${[...distinct].slice(0, 8).join('')}.jpg` : `${name}.jpg`;
}

export function photoCredit(p: EntityPhoto): string {
  return `${p.author}／${p.license}`;
}

export function validateEntitiesWiki(rows: EntityWiki[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const key = entityWikiKey(r.name, r.distinct);
    if (seen.has(key)) errors.push(`重複鍵：${key}`);
    seen.add(key);
    if (!r.wikiTitle) errors.push(`${key}：wikiTitle 不可為空`);
    if (!/^https:\/\/zh\.wikipedia\.org\/wiki\/./.test(r.wikipediaUrl)) {
      errors.push(`${key}：wikipediaUrl 須為 https://zh.wikipedia.org/wiki/…`);
    }
    if (r.photo && r.noPhoto) errors.push(`${key}：photo 與 noPhoto 不可並存`);
    else if (r.photo) {
      if (!r.photo.file.startsWith(PHOTO_DIR_URL)) errors.push(`${key}：photo.file 須以 ${PHOTO_DIR_URL} 開頭`);
      if (!r.photo.author) errors.push(`${key}：photo.author 不可為空`);
      if (!r.photo.license) errors.push(`${key}：photo.license 不可為空`);
      if (!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(r.photo.commonsUrl)) {
        errors.push(`${key}：photo.commonsUrl 須為 https://commons.wikimedia.org/wiki/File:…`);
      }
    }
  }
  return errors;
}

export function indexEntitiesWiki(rows: EntityWiki[]): Map<string, EntityWiki> {
  return new Map(rows.map((r) => [entityWikiKey(r.name, r.distinct), r]));
}

// 讀檔＋驗證；驗證失敗直接丟錯，讓每個用到對照表的腳本在一開始就停下來。
export function loadEntitiesWiki(): EntityWiki[] {
  const rows = JSON.parse(readFileSync(ENTITIES_WIKI_PATH, 'utf8')) as EntityWiki[];
  const errors = validateEntitiesWiki(rows);
  if (errors.length) throw new Error(`entities-wiki.json 驗證失敗：\n- ${errors.join('\n- ')}`);
  return rows;
}
```

`.gitignore` 加一行：

```
scraper/out-wiki-relations/
```

`package.json` scripts 加（放在 `"photos:record"` 之後）：

```json
    "wiki:resolve-entities": "tsx scraper/wiki-resolve-entities.ts",
    "enrich:entity-photos": "tsx scraper/enrich-entity-photos.ts",
    "wiki:discover-relations": "tsx scraper/wiki-discover-relations.ts"
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run test/entitiesWiki.test.ts`
Expected: PASS（9 tests）。

- [ ] **Step 5: Commit**

```bash
git add scraper/lib/entitiesWiki.ts scraper/entities-wiki.json test/entitiesWiki.test.ts .gitignore package.json
git commit -m "feat(scraper): 外部人物維基對照表模組與驗證"
```

---

### Task 2: 對照候選腳本 `wiki:resolve-entities` 與人工審定

**Files:**
- Create: `scraper/wiki-resolve-entities.ts`
- Modify: `scraper/entities-wiki.json`（人工審定結果）

**Interfaces:**
- Consumes: `loadEntitiesWiki`、`entityWikiKey`（Task 1）；`wikitextToSummary`、`fetchPolite`（既有）
- Produces: `scraper/out-wiki-relations/resolve.json`（gitignored），格式 `{ name, description, entity_type, candidates: [{ title, lead }] }[]`；審定後的 `scraper/entities-wiki.json`

- [ ] **Step 1: 寫腳本**

建立 `scraper/wiki-resolve-entities.ts`：

```ts
// 外部人物 → 維基條目 對照候選。撈 DB 全部 entities，逐人用維基搜尋 API 找同名條目、
// 取導言前 200 字，輸出到 scraper/out-wiki-relations/resolve.json 供人工比對。
// 不寫 DB、不寫 entities-wiki.json——對照必須由人比對 description 與導言後手寫。
//   pnpm run wiki:resolve-entities
//   ONLY=柯文哲,朱立倫 pnpm run wiki:resolve-entities
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';
import { fetchPolite } from './lib/fetchPolite';
import { wikitextToSummary } from './lib/wiki';
import { loadEntitiesWiki, indexEntitiesWiki, entityWikiKey } from './lib/entitiesWiki';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, 'out-wiki-relations');
const API = 'https://zh.wikipedia.org/w/api.php';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function apiJson(params: Record<string, string>): Promise<any> {
  const res = await fetchPolite(`${API}?${new URLSearchParams({ ...params, format: 'json' })}`);
  return res.json();
}

async function searchTitles(name: string): Promise<string[]> {
  const j = await apiJson({ action: 'query', list: 'search', srsearch: name, srlimit: '5' });
  return ((j?.query?.search ?? []) as { title: string }[]).map((s) => s.title);
}

async function leadOf(title: string): Promise<string> {
  const j = await apiJson({ action: 'parse', page: title, prop: 'wikitext', section: '0', redirects: '1' });
  return wikitextToSummary(j?.parse?.wikitext?.['*'] ?? '', 200);
}

async function main() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const sb = createClient(url, key);
  mkdirSync(OUT_DIR, { recursive: true });

  const known = indexEntitiesWiki(loadEntitiesWiki());
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

  const { data, error } = await sb.from('entities').select('name, entity_type, description').order('name');
  if (error) throw new Error(`entities query failed: ${error.message}`);
  const entities = (data ?? []) as { name: string; entity_type: string; description: string }[];

  const out: { name: string; entity_type: string; description: string; candidates: { title: string; lead: string }[] }[] = [];
  let skipped = 0;
  for (const e of entities) {
    if (only && !only.has(e.name)) continue;
    // 已對照者跳過。DB 沒有 distinct 欄位，只能用 name 判斷「這個姓名已有任一筆對照」；
    // 同名不同人的第二筆要人工用 ONLY= 強制重跑。
    if (known.has(entityWikiKey(e.name)) || [...known.keys()].some((k) => k.startsWith(`${e.name}::`))) { skipped++; continue; }
    const titles = await searchTitles(e.name);
    await sleep(500);
    const candidates: { title: string; lead: string }[] = [];
    for (const t of titles) {
      // 只看標題含姓名的條目，其餘搜尋命中多為無關頁面
      if (!t.includes(e.name)) continue;
      candidates.push({ title: t, lead: await leadOf(t) });
      await sleep(500);
    }
    out.push({ name: e.name, entity_type: e.entity_type, description: e.description, candidates });
    console.log(`${candidates.length ? '·' : '—'} ${e.name}（${e.description}）→ ${candidates.map((c) => c.title).join(' / ') || '查無'}`);
  }
  writeFileSync(join(OUT_DIR, 'resolve.json'), JSON.stringify(out, null, 2));
  console.log(`\n輸出 ${out.length} 人（已對照跳過 ${skipped}）→ scraper/out-wiki-relations/resolve.json`);
  console.log('下一步：逐筆比對 description 與 lead，確認同一人才寫入 scraper/entities-wiki.json。');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: 執行**

Run: `pnpm run wiki:resolve-entities`
Expected: 逐行印出 202 位外部人物的候選條目；產出 `scraper/out-wiki-relations/resolve.json`。多數 family_member 會是「查無」或命中無關同名條目，屬正常。

- [ ] **Step 3: 人工審定寫入 `scraper/entities-wiki.json`**

逐筆讀 `resolve.json`，對每一位：
- `candidates` 為空 → 不寫。
- 有候選：lead 必須能佐證 `description` 的職務／身分（例：description「前新北市長、國民黨主席」，lead 含「新北市市長」或「中國國民黨主席」）。有疑慮就不寫。
- 消歧義頁（lead 含「可以指」「消歧義」）→ 看其列出的條目，必要時用 `ONLY=<name>` 重跑不夠，直接人工開條目確認後填 `wikiTitle` 為實際條目名（如 `許淑華 (1975年)`）。
- 同名不同人（李傑 ×2、張美慧）：兩筆分別寫，`distinct` 值抄 curated 的 `counterpartDistinct`（用 `grep -n counterpartDistinct scraper/relationships-curated.json` 取原字串）。
- 派系組織（新潮流系、正國會、湧言會、蘇系…）有條目就寫。

每筆格式：

```json
{
  "name": "柯文哲",
  "wikiTitle": "柯文哲",
  "wikipediaUrl": "https://zh.wikipedia.org/wiki/%E6%9F%AF%E6%96%87%E5%93%B2"
}
```

`wikipediaUrl` = `https://zh.wikipedia.org/wiki/` + `encodeURIComponent(wikiTitle)`。以 `name` 排序。

- [ ] **Step 4: 驗證**

Run: `pnpm exec vitest run test/entitiesWiki.test.ts`
Expected: PASS（含「實際檔案通過驗證」）。

- [ ] **Step 5: Commit**

```bash
git add scraper/wiki-resolve-entities.ts scraper/entities-wiki.json
git commit -m "feat(scraper): 維基條目對照候選腳本，並審定 N 位外部人物的對照"
```

（commit message 的 N 填實際筆數。）

---

### Task 3: Commons 授權判定純函式 `commonsLicense.ts`

**Files:**
- Create: `scraper/lib/commonsLicense.ts`
- Test: `test/commonsLicense.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  ```ts
  export type ExtMetadata = Record<string, { value: string } | undefined>;
  export type LicenseVerdict =
    | { ok: true; license: string; author: string }
    | { ok: false; reason: string };
  export function pickLicense(meta: ExtMetadata | undefined): LicenseVerdict
  export function stripHtml(s: string): string
  ```

- [ ] **Step 1: 寫失敗測試**

建立 `test/commonsLicense.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { pickLicense, stripHtml } from '../scraper/lib/commonsLicense';

describe('stripHtml', () => {
  it('去標籤、合併空白', () => {
    expect(stripHtml('<a href="//commons.wikimedia.org/wiki/User:Foo">Foo</a>  Bar')).toBe('Foo Bar');
  });
});

describe('pickLicense', () => {
  it('CC BY-SA → ok，作者去 HTML', () => {
    const v = pickLicense({ LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="x">王小明</a>' } });
    expect(v).toEqual({ ok: true, license: 'CC BY-SA 4.0', author: '王小明' });
  });
  it('Public domain / CC0 → ok', () => {
    expect(pickLicense({ LicenseShortName: { value: 'Public domain' }, Artist: { value: 'A' } })).toMatchObject({ ok: true });
    expect(pickLicense({ LicenseShortName: { value: 'CC0' }, Artist: { value: 'A' } })).toMatchObject({ ok: true });
  });
  it('無 Artist 時退回 Credit，再退回「不詳」', () => {
    expect(pickLicense({ LicenseShortName: { value: 'CC BY 4.0' }, Credit: { value: '總統府' } })).toMatchObject({ author: '總統府' });
    expect(pickLicense({ LicenseShortName: { value: 'CC BY 4.0' } })).toMatchObject({ author: '不詳' });
  });
  it('fair use / 無授權資訊 → 不收', () => {
    expect(pickLicense({ LicenseShortName: { value: 'Fair use' } })).toEqual({ ok: false, reason: '授權不符：Fair use' });
    expect(pickLicense({})).toEqual({ ok: false, reason: '無授權資訊' });
    expect(pickLicense(undefined)).toEqual({ ok: false, reason: '無授權資訊' });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run test/commonsLicense.test.ts`
Expected: FAIL，模組不存在。

- [ ] **Step 3: 實作**

建立 `scraper/lib/commonsLicense.ts`：

```ts
// Wikimedia Commons imageinfo extmetadata → 可否使用與署名字串。純函式。
// 只收 CC 系列／公有領域；fair use 與缺授權資訊一律不收（本站要落地縮圖，不能靠合理使用）。
export type ExtMetadata = Record<string, { value: string } | undefined>;
export type LicenseVerdict =
  | { ok: true; license: string; author: string }
  | { ok: false; reason: string };

const ALLOWED = /^(CC|Public domain|CC0|PD)/i;

export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

export function pickLicense(meta: ExtMetadata | undefined): LicenseVerdict {
  const license = meta?.LicenseShortName?.value?.trim();
  if (!license) return { ok: false, reason: '無授權資訊' };
  if (!ALLOWED.test(license)) return { ok: false, reason: `授權不符：${license}` };
  const author = stripHtml(meta?.Artist?.value ?? '') || stripHtml(meta?.Credit?.value ?? '') || '不詳';
  return { ok: true, license, author };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run test/commonsLicense.test.ts`
Expected: PASS（5 tests）。

- [ ] **Step 5: Commit**

```bash
git add scraper/lib/commonsLicense.ts test/commonsLicense.test.ts
git commit -m "feat(scraper): Commons 授權判定純函式"
```

---

### Task 4: 照片腳本 `enrich:entity-photos` 與執行

**Files:**
- Create: `scraper/enrich-entity-photos.ts`
- Modify: `scraper/entities-wiki.json`（腳本寫回 `photo`；人工補 `noPhoto`）
- Create: `public/photos/entities/*.jpg`

**Interfaces:**
- Consumes: `loadEntitiesWiki`、`photoFileName`、`PHOTO_DIR_URL`、`ENTITIES_WIKI_PATH`、`EntityWiki`（Task 1）；`pickLicense`（Task 3）；`fetchPolite`
- Produces: 對照表每筆的 `photo` 欄位；`public/photos/entities/<file>`

- [ ] **Step 1: 寫腳本**

建立 `scraper/enrich-entity-photos.ts`：

```ts
// 外部人物照片：依 scraper/entities-wiki.json 逐人取維基條目主圖（pageimages）→ 查 Commons
// 授權（imageinfo extmetadata，只收 CC／公有領域）→ 下載 → sharp 縮 320px 寬 jpg →
// public/photos/entities/<name>.jpg → 把 photo{file,author,license,commonsUrl} 寫回對照表。
// 不碰 DB：photo_url 由 import:relationships 建 entity 時從對照表套上（重匯不會掉）。
//
// 冪等：已有 photo 且檔案存在 → 跳過；noPhoto: true → 跳過（人工判定主圖不是本人）。
//   pnpm run enrich:entity-photos
//   DRY_RUN=1 pnpm run enrich:entity-photos   # 只報告會抓哪張圖、授權為何，不寫檔不改對照表
//   FORCE=1  pnpm run enrich:entity-photos    # 重抓已有照片者
//   ONLY=柯文哲,朱立倫 pnpm run enrich:entity-photos
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { fetchPolite } from './lib/fetchPolite';
import { pickLicense, type ExtMetadata } from './lib/commonsLicense';
import {
  loadEntitiesWiki, photoFileName, PHOTO_DIR_URL, ENTITIES_WIKI_PATH, type EntityWiki,
} from './lib/entitiesWiki';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '..', 'public', 'photos', 'entities');
const API = 'https://zh.wikipedia.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'legislator-background-bot/1.0 (public-data; +https://github.com/weryk153/legislator-background)';
const DRY_RUN = !!process.env.DRY_RUN;
const FORCE = !!process.env.FORCE;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function apiJson(base: string, params: Record<string, string>): Promise<any> {
  const res = await fetchPolite(`${base}?${new URLSearchParams({ ...params, format: 'json' })}`);
  return res.json();
}

// 條目主圖：原圖 URL 與檔名（File:…）。無主圖 → null。
async function fetchPageImage(title: string): Promise<{ url: string; file: string } | null> {
  const j = await apiJson(API, { action: 'query', prop: 'pageimages', piprop: 'original|name', redirects: '1', titles: title });
  const page = Object.values(j?.query?.pages ?? {})[0] as { original?: { source?: string }; pageimage?: string } | undefined;
  if (!page?.original?.source || !page.pageimage) return null;
  return { url: page.original.source, file: page.pageimage };
}

async function fetchExtMetadata(file: string): Promise<ExtMetadata | undefined> {
  const j = await apiJson(COMMONS_API, { action: 'query', prop: 'imageinfo', iiprop: 'extmetadata', titles: `File:${file}` });
  const page = Object.values(j?.query?.pages ?? {})[0] as { imageinfo?: { extmetadata?: ExtMetadata }[] } | undefined;
  return page?.imageinfo?.[0]?.extmetadata;
}

// upload.wikimedia.org 會限流(429)：退避重試，比照 enrich-mayor-photos.ts。
async function download(url: string): Promise<Buffer> {
  for (let a = 0; a < 4; a++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * (a + 1)); continue; }
    throw new Error(`HTTP ${res.status}`);
  }
  throw new Error('HTTP 429 (重試後仍限流)');
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const rows = loadEntitiesWiki();
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

  let ok = 0, skip = 0, miss = 0, fail = 0;
  for (const r of rows) {
    const label = r.distinct ? `${r.name}（${r.distinct}）` : r.name;
    if (only && !only.has(r.name)) continue;
    if (r.noPhoto) { skip++; continue; }
    const fileName = photoFileName(r.name, r.distinct);
    if (!FORCE && r.photo && existsSync(join(OUT_DIR, fileName))) { skip++; continue; }
    try {
      const img = await fetchPageImage(r.wikiTitle);
      await sleep(500);
      if (!img) { miss++; console.log('—', label, '無主圖'); continue; }
      if (/\.svg$/i.test(img.file)) { miss++; console.log('—', label, '主圖為 SVG，跳過：', img.file); continue; }
      const verdict = pickLicense(await fetchExtMetadata(img.file));
      await sleep(500);
      if (!verdict.ok) { miss++; console.log('—', label, verdict.reason, `(${img.file})`); continue; }

      const buf = await download(img.url);
      const thumb = await sharp(buf).rotate().resize({ width: 320, withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true }).toBuffer();
      const photo: EntityWiki['photo'] = {
        file: `${PHOTO_DIR_URL}${fileName}`, author: verdict.author, license: verdict.license,
        commonsUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(img.file.replace(/ /g, '_'))}`,
      };
      if (DRY_RUN) {
        console.log('✓(dry)', label, '←', img.file, `${(thumb.length / 1024).toFixed(0)}KB`, `[${photo.license}｜${photo.author}]`);
        ok++; continue;
      }
      writeFileSync(join(OUT_DIR, fileName), thumb);
      r.photo = photo;
      ok++; console.log('✓', label, '→', photo.file, `[${photo.license}｜${photo.author}]`);
    } catch (e) {
      fail++; console.log('✗', label, e instanceof Error ? e.message : String(e));
    }
  }
  if (!DRY_RUN) writeFileSync(ENTITIES_WIKI_PATH, JSON.stringify(rows, null, 2) + '\n');
  console.log(`\n完成：成功 ${ok}、跳過 ${skip}、無圖/授權不符 ${miss}、失敗 ${fail}${DRY_RUN ? '（DRY_RUN，未寫檔）' : ''}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: DRY_RUN 並目視核對**

Run: `DRY_RUN=1 pnpm run enrich:entity-photos`
Expected: 每人一行，含圖檔名與授權。逐行看圖檔名：檔名明顯不是本人（合照、建築、logo、黨徽）者，在 `entities-wiki.json` 該筆加 `"noPhoto": true`。派系組織多半是 logo，一律 `noPhoto`。

- [ ] **Step 3: 正式執行**

Run: `pnpm run enrich:entity-photos`
Expected: `public/photos/entities/` 產生檔案；`entities-wiki.json` 各筆多出 `photo`。

- [ ] **Step 4: 目視抽查照片**

用 Read 工具開 5–10 張 `public/photos/entities/*.jpg`（優先看知名者與 family_member 型的政治人物）確認是人像且看起來是同一人。錯的：刪檔、刪該筆 `photo`、加 `noPhoto: true`。

- [ ] **Step 5: 驗證與 Commit**

Run: `pnpm exec vitest run test/entitiesWiki.test.ts`
Expected: PASS。

```bash
git add scraper/enrich-entity-photos.ts scraper/entities-wiki.json public/photos/entities
git commit -m "feat(scraper): 外部人物維基照片管線，落地 N 張（含 Commons 授權紀錄）"
```

---

### Task 5: 匯出層——entity 節點帶 photoUrl / wikipediaUrl / photoCredit

**Files:**
- Modify: `src/lib/types.ts:55-64`（GraphNode）
- Modify: `src/lib/graph.ts:33-55`（buildGraphData 簽名與 entity 節點）
- Modify: `scraper/export-graph.ts`
- Test: `test/graph.test.ts`

**Interfaces:**
- Consumes: `loadEntitiesWiki`、`photoCredit`（Task 1）
- Produces:
  ```ts
  // src/lib/types.ts
  export interface GraphNode { …; photoUrl?: string; photoCredit?: string; wikipediaUrl?: string }
  // src/lib/graph.ts
  export function buildGraphData(officials, entities, relationships, credits?: Map<string, string>): { data; errors }
  // credits: wikipedia_url → 「作者／授權」
  ```

- [ ] **Step 1: 寫失敗測試**

在 `test/graph.test.ts` 的 `describe('buildGraphData', …)` 內追加：

```ts
  it('entity 帶 photo_url / wikipedia_url 時輸出 photoUrl / wikipediaUrl；credits 以 wikipedia_url 配對', () => {
    const ents: RawEntity[] = [{
      id: 'e2', name: '柯文哲', entity_type: 'other', description: '台灣民眾黨創黨主席',
      photo_url: '/photos/entities/柯文哲.jpg', wikipedia_url: 'https://zh.wikipedia.org/wiki/%E6%9F%AF%E6%96%87%E5%93%B2',
    }];
    const credits = new Map([['https://zh.wikipedia.org/wiki/%E6%9F%AF%E6%96%87%E5%93%B2', '王小明／CC BY-SA 4.0']]);
    const { data } = buildGraphData(officials, ents,
      [rel({ to_type: 'entity', to_id: 'e2', relation_type: 'mentor' })], credits);
    expect(data.nodes.find((n) => n.key === 'entity:e2')).toMatchObject({
      photoUrl: '/photos/entities/柯文哲.jpg',
      wikipediaUrl: 'https://zh.wikipedia.org/wiki/%E6%9F%AF%E6%96%87%E5%93%B2',
      photoCredit: '王小明／CC BY-SA 4.0',
    });
  });

  it('entity 無照片／無條目時不帶 photoUrl / wikipediaUrl / photoCredit 欄位', () => {
    const { data } = buildGraphData(officials, entities,
      [rel({ to_type: 'entity', to_id: 'e1', relation_type: 'spouse' })]);
    const n = data.nodes.find((x) => x.key === 'entity:e1')!;
    expect('photoUrl' in n).toBe(false);
    expect('wikipediaUrl' in n).toBe(false);
    expect('photoCredit' in n).toBe(false);
  });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run test/graph.test.ts`
Expected: 第一個新測試 FAIL（photoUrl undefined）。

- [ ] **Step 3: 實作**

`src/lib/types.ts` 的 `GraphNode` 改為：

```ts
export interface GraphNode {
  key: string;            // `${kind}:${id}`
  name: string;
  kind: NodeRefType;
  subtype: string;        // official: officeType；entity: entity_type
  slug?: string;          // official 才有，可連回檔案頁
  party?: string;         // official
  officeType?: OfficeType;// official
  photoUrl?: string;      // official 或有照片的 entity；photo_url 為 null 時不帶此欄位
  photoCredit?: string;   // entity 且照片來自 Commons 時：「作者／授權」；來自 scraper/entities-wiki.json
  wikipediaUrl?: string;  // entity 有維基條目時
  description?: string;   // entity
}
```

`src/lib/graph.ts` 的 `buildGraphData` 簽名與 entity 節點：

```ts
export function buildGraphData(
  officials: RawOfficialNode[],
  entities: RawEntity[],
  relationships: RawRelationship[],
  // wikipedia_url → 「作者／授權」。DB 不存授權欄位；export-graph.ts 從 scraper/entities-wiki.json 組好傳入。
  // 用 wikipedia_url 而非姓名配對：DB entity 沒有 distinct 欄位，同名不同人只有條目 URL 能區分。
  credits: Map<string, string> = new Map(),
): { data: GraphData; errors: string[] } {
```

```ts
  for (const e of entities) {
    const credit = e.wikipedia_url ? credits.get(e.wikipedia_url) : undefined;
    allNodes.set(keyOf('entity', e.id), {
      key: keyOf('entity', e.id), name: e.name, kind: 'entity',
      subtype: e.entity_type, description: e.description,
      ...(e.photo_url ? { photoUrl: e.photo_url } : {}),
      ...(e.photo_url && credit ? { photoCredit: credit } : {}),
      ...(e.wikipedia_url ? { wikipediaUrl: e.wikipedia_url } : {}),
    });
  }
```

`scraper/export-graph.ts`：import 加 `import { loadEntitiesWiki, photoCredit } from './lib/entitiesWiki';`，在呼叫 `buildGraphData` 前組 credits 並傳入：

```ts
  // 照片授權：對照表 wikipediaUrl → 「作者／授權」，讓前端 tooltip 能署名（CC BY 系列要求）。
  const credits = new Map<string, string>();
  for (const r of loadEntitiesWiki()) if (r.photo) credits.set(r.wikipediaUrl, photoCredit(r.photo));

  const { data, errors } = buildGraphData(
    officials as Parameters<typeof buildGraphData>[0],
    (entities ?? []) as RawEntity[],
    (relationships ?? []) as unknown as RawRelationship[],
    credits,
  );
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/graph.ts scraper/export-graph.ts test/graph.test.ts
git commit -m "feat(graph): entity 節點匯出 photoUrl / wikipediaUrl / photoCredit"
```

---

### Task 6: `import-relationships.ts` 建 entity 時套用對照表，並重匯匯出

**Files:**
- Modify: `scraper/import-relationships.ts`（`ensureEntity` 與結尾報告）
- Regenerate: `src/data/graph.json`

**Interfaces:**
- Consumes: `loadEntitiesWiki`、`indexEntitiesWiki`、`entityWikiKey`（Task 1）
- Produces: DB `entities.wikipedia_url`、`entities.photo_url` 有值；graph.json entity 節點帶照片

- [ ] **Step 1: 修改 `ensureEntity`**

檔頭 import 加：

```ts
import { loadEntitiesWiki, indexEntitiesWiki, entityWikiKey } from './lib/entitiesWiki';
```

`main()` 內、`const entityCache = …` 之前加：

```ts
  // 外部人物 ↔ 維基條目／照片 對照（版控檔案）。entity 每次重匯都重建，照片與條目 URL
  // 只能在這裡套上；沒有對照的 entity 兩欄維持 null。
  const wikiIndex = indexEntitiesWiki(loadEntitiesWiki());
  const wikiUsed = new Set<string>();
```

`ensureEntity` 的 insert 改為：

```ts
    const subtype = ENTITY_TYPES.has(etype) ? etype : 'other';
    const wiki = wikiIndex.get(cacheKey);
    if (wiki) wikiUsed.add(cacheKey);
    const { data, error } = await supabase.from('entities').insert({
      name, entity_type: subtype, description: desc,
      wikipedia_url: wiki?.wikipediaUrl ?? null,
      photo_url: wiki?.photo?.file ?? null,
    }).select('id').single();
```

（`cacheKey` 的算法 `distinct ? \`${name}::${distinct}\` : name` 與 `entityWikiKey` 相同；把該行改為 `const cacheKey = entityWikiKey(name, distinct);` 以確保單一定義。）

- [ ] **Step 2: 加報告**

在「匯入完成」那行 `console.log` 之後加：

```ts
  // 對照表有、但本次匯入沒建出對應 entity：代表該人已從 curated 消失（或改走 official 路徑），
  // 對照表該清掉，否則照片檔會變孤兒。
  const wikiStale = [...wikiIndex.keys()].filter((k) => !wikiUsed.has(k));
  if (wikiStale.length) {
    console.log(`\nℹ️ entities-wiki.json 有、但本次未建出 entity（${wikiStale.length} 筆，請檢查是否該移除）：`);
    for (const k of wikiStale) console.log(`  - ${k}`);
  }
```

- [ ] **Step 3: 重匯與匯出**

Run: `pnpm run import:relationships`
Expected: 「匯入完成：315 筆關係…」數字與上次相同（見 spec §1.1：315 列、少數 skip）；wikiStale 清單為空或只列出確實已不在 curated 的人（有的話從對照表刪除、刪照片檔、重跑）。

Run: `pnpm run export:graph`
Expected: `exported graph: 352 nodes, 262 edges`（與現況相同）。

Run: `node -e "const g=require('./src/data/graph.json');const e=g.nodes.filter(n=>n.kind==='entity');console.log('entity',e.length,'photo',e.filter(n=>n.photoUrl).length,'credit',e.filter(n=>n.photoCredit).length,'wiki',e.filter(n=>n.wikipediaUrl).length)"`
Expected: photo 數 = Task 4 落地張數；credit 數 = photo 數；wiki 數 = 對照表筆數。

- [ ] **Step 4: 測試與 Commit**

Run: `pnpm test`
Expected: PASS。

```bash
git add scraper/import-relationships.ts src/data/graph.json
git commit -m "feat(import): 建 entity 時套用維基對照表（wikipedia_url、photo_url），重匯匯出"
```

---

### Task 7: 前端——entity 頭像、節點 tooltip（描述／條目連結／照片署名）、about 頁

**Files:**
- Modify: `src/lib/graphView.ts:6-11`（CyNode data）、`:108-128`（toCytoscapeElements）
- Modify: `src/components/RelationshipGraph.svelte:165-190`（tooltip 區）、`:253-255`（樣式）
- Modify: `src/pages/about.astro:31`
- Test: `test/graphView.test.ts`

**Interfaces:**
- Consumes: `GraphNode.photoUrl / photoCredit / wikipediaUrl / description`（Task 5）
- Produces:
  ```ts
  export interface CyNode { data: { …既有…; description: string; wikipediaUrl: string; photoCredit: string } }
  ```

- [ ] **Step 1: 寫失敗測試**

`test/graphView.test.ts` 追加一個 describe：

```ts
describe('toCytoscapeElements：entity 照片與 tooltip 資料', () => {
  const withPhoto: GraphData = {
    nodes: [
      { key: 'official:a', name: '王又民', kind: 'official', subtype: 'councilor', slug: 'wang', party: '無', officeType: 'councilor' },
      { key: 'entity:k', name: '柯文哲', kind: 'entity', subtype: 'other', description: '台灣民眾黨創黨主席',
        photoUrl: '/photos/entities/柯文哲.jpg', photoCredit: '王小明／CC BY-SA 4.0',
        wikipediaUrl: 'https://zh.wikipedia.org/wiki/%E6%9F%AF%E6%96%87%E5%93%B2' },
    ],
    edges: [{ id: 'r1', source: 'official:a', target: 'entity:k', type: 'mentor', directed: false, note: null, sourceUrl: 'https://x' }],
  };
  it('entity 有 photoUrl 時 avatar 為該 URL', () => {
    const { nodes } = toCytoscapeElements(withPhoto, 'official:a');
    expect(nodes.find((n) => n.data.id === 'entity:k')!.data.avatar).toBe('/photos/entities/柯文哲.jpg');
  });
  it('entity 帶 description / wikipediaUrl / photoCredit；official 為空字串', () => {
    const { nodes } = toCytoscapeElements(withPhoto, 'official:a');
    expect(nodes.find((n) => n.data.id === 'entity:k')!.data).toMatchObject({
      description: '台灣民眾黨創黨主席',
      wikipediaUrl: 'https://zh.wikipedia.org/wiki/%E6%9F%AF%E6%96%87%E5%93%B2',
      photoCredit: '王小明／CC BY-SA 4.0',
    });
    expect(nodes.find((n) => n.data.id === 'official:a')!.data).toMatchObject({ description: '', wikipediaUrl: '', photoCredit: '' });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run test/graphView.test.ts`
Expected: 第二個新測試 FAIL（description undefined）；第一個可能已 PASS（avatar 邏輯本就不分 kind）。

- [ ] **Step 3: 實作 graphView**

`CyNode` 介面改為：

```ts
export interface CyNode {
  data: {
    id: string; label: string; name: string; slug: string; kind: string;
    depth: number; center: 0 | 1; size: number; avatar: string;
    // 節點 tooltip 用（entity 才有內容；official 為空字串，Cytoscape data 不放 undefined）
    description: string; wikipediaUrl: string; photoCredit: string;
  };
}
```

`toCytoscapeElements` 節點 data 在 `avatar:` 之後加：

```ts
        description: n.description ?? '',
        wikipediaUrl: n.wikipediaUrl ?? '',
        photoCredit: n.photoCredit ?? '',
```

- [ ] **Step 4: 實作 Svelte 節點 tooltip**

`RelationshipGraph.svelte` 在 `cy!.on('mouseout', 'edge', …)` 那行之後加：

```ts
        // hover 外部人物節點 → tooltip（描述＋條目連結＋照片署名）。本站收錄的公職點擊即進檔案頁，不需要。
        // 照片來自 Wikimedia Commons，CC BY 系列要求可見署名，故署名放在圖上、不只放 about 頁。
        cy!.on('mouseover', 'node[kind = "entity"]', (evt: any) => {
          clearTimeout(hideTimer);
          const d = evt.target.data();
          const desc = d.description ? `<div class="rg-note">${esc(d.description)}</div>` : '';
          const wiki = d.wikipediaUrl
            ? `<a class="rg-src" href="${esc(d.wikipediaUrl)}" target="_blank" rel="noopener">維基百科條目 ↗</a>` : '';
          const credit = d.photoCredit ? `<div class="rg-credit">照片：${esc(d.photoCredit)}</div>` : '';
          if (!desc && !wiki && !credit) return;
          const p = evt.target.renderedPosition();
          const r = evt.target.renderedOuterWidth() / 2;
          tip!.innerHTML = `<div class="rg-rel">${esc(d.name)}</div>${desc}${wiki}${credit}`;
          tip!.style.left = `${p.x}px`;
          tip!.style.top = `${p.y - r}px`;
          tip!.style.opacity = '1';
          tip!.style.pointerEvents = 'auto';
        });
        cy!.on('mouseout', 'node[kind = "entity"]', hideSoon);
```

樣式區在 `:global(.rg-tip .rg-src)` 之後加：

```css
  :global(.rg-tip .rg-credit) { margin-top: 4px; font-size: var(--t-xs, 0.78em); color: var(--faint); }
```

（若 `src/styles/tokens.css` 沒有 `--t-xs`，改用 `font-size: 0.85em`，不新增 token。）

- [ ] **Step 5: about 頁**

`src/pages/about.astro` 在「已解職議員部分照片」那個 `<li>` 之後加：

```html
        <li>外部人物照片：維基百科條目主圖（Wikimedia Commons，CC 授權／公有領域），逐張作者與授權標示於關係圖節點提示與資料庫附註</li>
```

- [ ] **Step 6: 測試、建置、目視**

Run: `pnpm test`
Expected: PASS。

Run: `pnpm build`
Expected: 成功，無型別錯誤。

Run: `pnpm dev`，開 `http://localhost:4321/graph`，確認：有條目的外部人物節點顯示照片（不再是姓氏字圓）；hover 柯文哲等節點出現描述、「維基百科條目 ↗」、「照片：作者／授權」；hover 連線 tooltip 行為不變；亮／暗模式都可讀。再開任一有柯文哲關係的立委檔案頁確認 ego 圖同樣顯示。

- [ ] **Step 7: Commit**

```bash
git add src/lib/graphView.ts src/components/RelationshipGraph.svelte src/pages/about.astro test/graphView.test.ts
git commit -m "feat(graph): 外部人物頭像與節點 tooltip（描述／條目／照片署名）"
```

**Stage 1 驗收**：`/graph` 上有條目的外部人物有頭像與署名；重跑 `import:relationships` + `export:graph` 後照片仍在。

---

## Stage 2：2 度關係

### Task 8: 端點解析抽成純函式 `relEndpoints.ts`（行為不變）

**Files:**
- Create: `scraper/lib/relEndpoints.ts`
- Modify: `scraper/import-relationships.ts`（`officialId`、counterpart 解析改呼叫模組）
- Test: `test/relEndpoints.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  ```ts
  export type Roster = { id: string; name: string; office_type: string }[];
  export interface EndpointRow {
    subject: string; subjectKind?: 'official' | 'entity'; subjectDistinct?: string;
    counterpartName: string; counterpartKind: 'official' | 'entity'; counterpartDistinct?: string;
  }
  export const NATIONAL: ReadonlySet<string>;   // legislator, mayor_magistrate
  export function officialIdIn(roster: Roster, name: string, restrict?: boolean): string | null;
  export type SubjectResolution = { type: 'official' | 'entity'; id: string } | { skip: string };
  export function resolveSubject(row: EndpointRow, roster: Roster, entityCache: Map<string, string>): SubjectResolution;
  export type CounterpartResolution = { type: 'official'; id: string } | { type: 'entity'; fellThrough: boolean };
  export function resolveCounterpart(row: EndpointRow, roster: Roster): CounterpartResolution;
  ```

- [ ] **Step 1: 寫失敗測試**

建立 `test/relEndpoints.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { officialIdIn, resolveSubject, resolveCounterpart, type Roster, type EndpointRow } from '../scraper/lib/relEndpoints';

const roster: Roster = [
  { id: 'L1', name: '傅崐萁', office_type: 'legislator' },
  { id: 'M1', name: '徐榛蔚', office_type: 'mayor_magistrate' },
  { id: 'C1', name: '張美慧', office_type: 'councilor' },
  { id: 'C2', name: '王小明', office_type: 'councilor' },
  { id: 'C3', name: '王小明', office_type: 'councilor' },
];
const row = (over: Partial<EndpointRow> = {}): EndpointRow => ({
  subject: '傅崐萁', counterpartName: '徐榛蔚', counterpartKind: 'official', ...over,
});

describe('officialIdIn', () => {
  it('唯一匹配才回 id；同名多人回 null', () => {
    expect(officialIdIn(roster, '傅崐萁')).toBe('L1');
    expect(officialIdIn(roster, '王小明')).toBeNull();
    expect(officialIdIn(roster, '沒有人')).toBeNull();
  });
  it('restrict 只看立委／首長', () => {
    expect(officialIdIn(roster, '張美慧')).toBe('C1');
    expect(officialIdIn(roster, '張美慧', true)).toBeNull();
  });
});

describe('resolveSubject', () => {
  const cache = new Map([['柯文哲', 'E1'], ['李傑::學者', 'E2']]);
  it('預設（official）限立委／首長', () => {
    expect(resolveSubject(row(), roster, cache)).toEqual({ type: 'official', id: 'L1' });
    expect(resolveSubject(row({ subject: '張美慧' }), roster, cache)).toEqual({ skip: 'subject 未匹配: 張美慧' });
  });
  it('subjectKind entity 從快取找 name / name::distinct', () => {
    expect(resolveSubject(row({ subject: '柯文哲', subjectKind: 'entity' }), roster, cache)).toEqual({ type: 'entity', id: 'E1' });
    expect(resolveSubject(row({ subject: '李傑', subjectKind: 'entity', subjectDistinct: '學者' }), roster, cache)).toEqual({ type: 'entity', id: 'E2' });
  });
  it('entity subject 不在快取 → skip，不建新 entity', () => {
    expect(resolveSubject(row({ subject: '李傑', subjectKind: 'entity' }), roster, cache)).toEqual({ skip: 'subject entity 尚未建立: 李傑' });
    expect(resolveSubject(row({ subject: '李傑', subjectKind: 'entity', subjectDistinct: '國防部長' }), roster, cache))
      .toEqual({ skip: 'subject entity 尚未建立: 李傑::國防部長' });
  });
});

describe('resolveCounterpart', () => {
  it('official 且名冊唯一匹配（不限層級）→ official', () => {
    expect(resolveCounterpart(row(), roster)).toEqual({ type: 'official', id: 'M1' });
    expect(resolveCounterpart(row({ counterpartName: '張美慧' }), roster)).toEqual({ type: 'official', id: 'C1' });
  });
  it('counterpartDistinct 一律 entity，且不算 fell-through', () => {
    expect(resolveCounterpart(row({ counterpartName: '張美慧', counterpartDistinct: '企業高管' }), roster))
      .toEqual({ type: 'entity', fellThrough: false });
  });
  it('official 但名冊無唯一匹配 → entity 並標 fellThrough', () => {
    expect(resolveCounterpart(row({ counterpartName: '柯文哲' }), roster)).toEqual({ type: 'entity', fellThrough: true });
    expect(resolveCounterpart(row({ counterpartName: '王小明' }), roster)).toEqual({ type: 'entity', fellThrough: true });
  });
  it('counterpartKind entity → entity，不查名冊、不算 fell-through', () => {
    expect(resolveCounterpart(row({ counterpartName: '徐榛蔚', counterpartKind: 'entity' }), roster)).toEqual({ type: 'entity', fellThrough: false });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run test/relEndpoints.test.ts`
Expected: FAIL，模組不存在。

- [ ] **Step 3: 實作模組**

建立 `scraper/lib/relEndpoints.ts`：

```ts
// relationships-curated.json 每列 → 兩端點的解析規則。純函式，無 I/O；名冊與 entity 快取由呼叫端注入。
// 從 import-relationships.ts 搬出，行為與搬出前一致：
//   - subject 預設須為立委／首長且名冊唯一匹配（「常見名寧缺勿錯」）。
//   - subjectKind: 'entity'（2 度關係）從既有 entity 快取找，找不到就 skip——絕不因 subject 建新 entity。
//   - counterpartDistinct 有值 → 一律 entity：這是人查證過「與名冊同名者不是同一人」的標記，
//     若仍走姓名比對，哪天名冊收進同名者這筆就會靜默改連到別人身上。
//   - counterpartKind: 'official' 但名冊無唯一匹配 → 退成 entity 並標 fellThrough，讓匯入報告看得見。
import { entityWikiKey } from './entitiesWiki';

export type Roster = { id: string; name: string; office_type: string }[];
export interface EndpointRow {
  subject: string;
  subjectKind?: 'official' | 'entity';
  subjectDistinct?: string;
  counterpartName: string;
  counterpartKind: 'official' | 'entity';
  counterpartDistinct?: string;
}
export const NATIONAL: ReadonlySet<string> = new Set(['legislator', 'mayor_magistrate']);

export function officialIdIn(roster: Roster, name: string, restrict = false): string | null {
  const pool = roster.filter((o) => o.name === name && (!restrict || NATIONAL.has(o.office_type)));
  return pool.length === 1 ? pool[0].id : null;
}

export type SubjectResolution = { type: 'official' | 'entity'; id: string } | { skip: string };
export function resolveSubject(row: EndpointRow, roster: Roster, entityCache: Map<string, string>): SubjectResolution {
  if (row.subjectKind === 'entity') {
    const key = entityWikiKey(row.subject, row.subjectDistinct);
    const id = entityCache.get(key);
    return id ? { type: 'entity', id } : { skip: `subject entity 尚未建立: ${key}` };
  }
  const id = officialIdIn(roster, row.subject, true);
  return id ? { type: 'official', id } : { skip: `subject 未匹配: ${row.subject}` };
}

export type CounterpartResolution = { type: 'official'; id: string } | { type: 'entity'; fellThrough: boolean };
export function resolveCounterpart(row: EndpointRow, roster: Roster): CounterpartResolution {
  if (row.counterpartDistinct) return { type: 'entity', fellThrough: false };
  if (row.counterpartKind !== 'official') return { type: 'entity', fellThrough: false };
  const id = officialIdIn(roster, row.counterpartName);
  return id ? { type: 'official', id } : { type: 'entity', fellThrough: true };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run test/relEndpoints.test.ts`
Expected: PASS（9 tests）。

- [ ] **Step 5: 改 import 腳本改用模組（行為不變）**

`scraper/import-relationships.ts`：
- import 加 `import { resolveSubject, resolveCounterpart, officialIdIn, type Roster } from './lib/relEndpoints';`
- `Curated` 型別加兩個選填欄位（放在 `counterpartDistinct` 之前）：
  ```ts
    // 2 度關係：subject 為既有 entity（如柯文哲）。省略＝official。subjectDistinct 對應建立該 entity
    // 那列的 counterpartDistinct，一字不差。
    subjectKind?: 'official' | 'entity';
    subjectDistinct?: string;
  ```
- 刪掉 `byName`、`NATIONAL`、`officialId` 三段定義，改為 `const roster: Roster = officials;` 與 `const officialId = (name: string, restrict?: boolean) => officialIdIn(roster, name, restrict);`（後面的覆核警示仍用 `officialId`）。
- 迴圈開頭 `const subjId = officialId(r.subject, true); if (!subjId) {…}` 改為：
  ```ts
    const subj = resolveSubject(r, roster, entityCache);
    if ('skip' in subj) { skipped++; skips.push(subj.skip); continue; }
  ```
- counterpart 那段（從 `let toType…` 到 `ensureEntity(...)` 結束）改為：
  ```ts
    let toType: 'official' | 'entity', toId: string;
    const cp = resolveCounterpart(r, roster);
    if (cp.type === 'official') { toType = 'official'; toId = cp.id; }
    else {
      if (cp.fellThrough) officialFellThrough.push(`${r.counterpartName}（${r.subject} 的 ${r.relationType}）`);
      toType = 'entity';
      toId = await ensureEntity(r.counterpartName, r.counterpartEntityType ?? 'other', r.counterpartRole || r.note, r.counterpartDistinct);
    }
  ```
- 方向那段 `let fromType: 'official' | 'entity' = 'official', fromId = subjId;` 改為 `let fromType = subj.type, fromId = subj.id;`，而 parent_child 反向那行的 `'official', subjId` 改為 `subj.type, subj.id`。
- 原本兩段長註解（counterpartDistinct 的理由、fell-through 的理由）已搬到模組檔頭，此處只留一行「端點解析規則見 ./lib/relEndpoints.ts」。

- [ ] **Step 6: 重匯確認行為不變**

Run: `pnpm run import:relationships`
Expected: 「匯入完成」各數字與 Task 6 Step 3 完全相同；fell-through 清單相同。

Run: `pnpm run export:graph && git diff --stat src/data/graph.json`
Expected: graph.json 只有 UUID 變動（節點數、邊數不變）。

- [ ] **Step 7: 測試與 Commit**

Run: `pnpm test`
Expected: PASS。

```bash
git add scraper/lib/relEndpoints.ts scraper/import-relationships.ts test/relEndpoints.test.ts src/data/graph.json
git commit -m "refactor(import): 端點解析抽成純函式 relEndpoints 並補測試（行為不變）"
```

---

### Task 9: 兩輪匯入（entity-subject 列）與報告

**Files:**
- Modify: `scraper/import-relationships.ts`（主迴圈）

**Interfaces:**
- Consumes: `resolveSubject`（Task 8；`subjectKind: 'entity'` 路徑）
- Produces: curated 內 `subjectKind: 'entity'` 的列可匯入為 entity→official／entity→entity 邊

- [ ] **Step 1: 把主迴圈改成兩輪**

把 `for (const r of rows) { … }` 整個迴圈本體抽成 `async function importRow(r: Curated): Promise<void>`（內部沿用 `inserted++`、`skipped++`、`skips`、`officialFellThrough` 這些閉包變數），然後：

```ts
  // 兩輪：先匯 official-subject 列建出所有 entity，再匯 entity-subject 列（2 度關係，subject
  // 必須已在第一輪建出；否則 resolveSubject 會 skip 並列報，不會靜默建新節點）。
  const firstPass = rows.filter((r) => r.subjectKind !== 'entity');
  const secondPass = rows.filter((r) => r.subjectKind === 'entity');
  for (const r of firstPass) await importRow(r);
  for (const r of secondPass) await importRow(r);
```

`importRow` 內、方向決定之後、寫 source 之前加自連預檢：

```ts
    if (fromType === toType && fromId === toId) {
      skipped++; skips.push(`自連略過: ${r.subject}-${r.counterpartName}（${r.relationType}）`); return;
    }
```

（原本 `continue` 改成 `return`。）

- [ ] **Step 2: 報告**

「匯入完成」那行之後加（在 wikiStale 報告之前）：

```ts
  // 2 度關係列的 subject 找不到：curated 拼字或 subjectDistinct 與建立該 entity 的 counterpartDistinct 不一致，
  // 必須人工處理，故獨立列出而不混在一般 skip 裡。
  const subjectMissing = skips.filter((s) => s.startsWith('subject entity 尚未建立'));
  if (subjectMissing.length) {
    console.log(`\n⚠️ 2 度關係 subject 找不到對應 entity（${subjectMissing.length} 筆）：`);
    for (const s of subjectMissing) console.log(`  - ${s}`);
  }
```

- [ ] **Step 3: 用一筆假資料驗證路徑**

暫時在 `scraper/relationships-curated.json` 末尾加一列：

```json
  {
    "subject": "柯文哲",
    "subjectKind": "entity",
    "counterpartName": "測試用不存在的人",
    "counterpartRole": "測試",
    "counterpartKind": "entity",
    "counterpartEntityType": "other",
    "relationType": "aide",
    "parentName": "",
    "note": "測試列，匯入後即刪",
    "sourceUrl": "https://zh.wikipedia.org/wiki/%E6%9F%AF%E6%96%87%E5%93%B2",
    "sourceType": "wiki"
  }
```

Run: `pnpm run import:relationships`
Expected: 「匯入完成：316 筆關係」；無 subjectMissing 警示。

再把 `"subject": "柯文哲"` 改成 `"subject": "柯文哲x"` 重跑：
Expected: 315 筆；出現「⚠️ 2 度關係 subject 找不到對應 entity（1 筆）：subject entity 尚未建立: 柯文哲x」。

**刪掉測試列**，重跑 `pnpm run import:relationships` 回到 315。

- [ ] **Step 4: 測試與 Commit**

Run: `pnpm test`
Expected: PASS。

```bash
git add scraper/import-relationships.ts
git commit -m "feat(import): 兩輪匯入支援 subjectKind entity 的 2 度關係，並列報找不到的 subject"
```

---

### Task 10: `wikiRelations.ts`——infobox 關係欄位解析

**Files:**
- Create: `scraper/lib/wikiRelations.ts`
- Test: `test/wikiRelations.test.ts`

**Interfaces:**
- Consumes: 無（自含的 wikitext 清理；`-{}-` 轉換規則與 `wiki.ts` 的 `wikitextToSummary` 相同）
- Produces:
  ```ts
  export interface InfoboxRelation { field: string; name: string; wikilinkTitle?: string; raw: string }
  export function findInfobox(wikitext: string): string | null      // 最外層 {{Infobox…}} 原文（含大括號）
  export function splitTopLevel(body: string, sep: string): string[] // 依 depth-0 的分隔字元切
  export function parseInfoboxRelations(wikitext: string): InfoboxRelation[]
  export function cleanWikitextInline(s: string): string             // 去 ref/註解/模板/連結/粗體/HTML，-{}- 取 zh-tw
  ```

- [ ] **Step 1: 寫失敗測試**

建立 `test/wikiRelations.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { findInfobox, splitTopLevel, parseInfoboxRelations, cleanWikitextInline } from '../scraper/lib/wikiRelations';

const page = `{{Infobox officeholder
| name = 柯文哲
| image = Ko.jpg
| spouse = [[陳佩琪]]（1991年結婚）
| parents = 柯承發（父）<br />何瑞英（母）
| children = 2子1女
| relatives = {{ubl|[[柯承發|柯承發]]|[[何瑞英]]}}
| party = {{TPP}}
}}
'''柯文哲'''（{{bd|1959年|8月6日}}）是-{zh-tw:臺灣;zh-cn:台湾}-政治人物。<ref>x</ref>
== 家庭 ==
柯文哲之妻[[陳佩琪]]為醫師。`;

describe('findInfobox', () => {
  it('取出最外層 Infobox 模板（含巢狀模板）', () => {
    const box = findInfobox(page)!;
    expect(box.startsWith('{{Infobox officeholder')).toBe(true);
    expect(box.endsWith('}}')).toBe(true);
    expect(box).toContain('{{ubl|[[柯承發|柯承發]]|[[何瑞英]]}}');
    expect(box).not.toContain("'''柯文哲'''");
  });
  it('中文信息框名稱也算', () => {
    expect(findInfobox('{{政治人物信息框\n| 配偶 = 甲\n}}')).not.toBeNull();
  });
  it('沒有 infobox → null', () => {
    expect(findInfobox('純文字')).toBeNull();
  });
});

describe('splitTopLevel', () => {
  it('不切巢狀模板／連結內的分隔字元', () => {
    expect(splitTopLevel('a|{{x|y}}|[[b|c]]|d', '|')).toEqual(['a', '{{x|y}}', '[[b|c]]', 'd']);
  });
});

describe('cleanWikitextInline', () => {
  it('去 ref／模板／粗體，連結取顯示文字，-{}- 取 zh-tw', () => {
    expect(cleanWikitextInline("'''甲'''<ref>r</ref>是-{zh-tw:臺灣;zh-cn:台湾}-[[乙|丙]]{{fact}}")).toBe('甲是臺灣丙');
  });
});

describe('parseInfoboxRelations', () => {
  const rels = parseInfoboxRelations(page);
  it('配偶：取連結標題，附註括號從 name 去掉、raw 保留', () => {
    expect(rels).toContainEqual({ field: 'spouse', name: '陳佩琪', wikilinkTitle: '陳佩琪', raw: '[[陳佩琪]]（1991年結婚）' });
  });
  it('<br> 分隔的多值各成一筆；無連結者無 wikilinkTitle', () => {
    expect(rels).toContainEqual({ field: 'parents', name: '柯承發', raw: '柯承發（父）' });
    expect(rels).toContainEqual({ field: 'parents', name: '何瑞英', raw: '何瑞英（母）' });
  });
  it('{{ubl}} 內的項目各成一筆', () => {
    expect(rels.filter((r) => r.field === 'relatives').map((r) => r.name)).toEqual(['柯承發', '何瑞英']);
  });
  it('純數字描述（2子1女）不當人名', () => {
    expect(rels.find((r) => r.field === 'children')).toBeUndefined();
  });
  it('非關係欄位（party、image）不出現', () => {
    expect(rels.some((r) => r.field === 'party' || r.field === 'image')).toBe(false);
  });
  it('無 infobox → []', () => {
    expect(parseInfoboxRelations('沒有')).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run test/wikiRelations.test.ts`
Expected: FAIL，模組不存在。

- [ ] **Step 3: 實作**

建立 `scraper/lib/wikiRelations.ts`：

```ts
// wikitext → 關係候選（純字串處理，無 I/O）。供 wiki-discover-relations.ts 產候選 JSON；
// 輸出只是「給人審的線索」，不是關係本身——欄位語意、方向、是否超譯全由人工審定決定。
// 見 spec §7.1。

export interface InfoboxRelation {
  field: string;           // 正規化後的欄位名（小寫、去空白），如 spouse / 配偶 / parents
  name: string;            // 清理後的人名（去括號附註）
  wikilinkTitle?: string;  // 值內第一個 [[連結]] 的標題，有的話
  raw: string;             // 該值的原始 wikitext（切分後）
}

// 關係欄位白名單（含中英文；比對時小寫、去空白）
const RELATION_FIELDS = new Set([
  'spouse', 'partner', 'parents', 'father', 'mother', 'children', 'relatives', 'relations', 'family',
  '配偶', '伴侶', '父母', '父親', '母親', '子女', '兒女', '親屬', '親戚', '家族', '家人',
]);

// -{}- 語言轉換標記：取 zh-tw（或 zh/hant/hk/mo），否則去掉前導旗標。與 wiki.ts wikitextToSummary 同規則。
function resolveLangConv(s: string): string {
  return s.replace(/-\{([^{}]*)\}-/g, (_m, body: string) => {
    const tw = body.match(/zh(?:-(?:tw|hant|hk|mo))?\s*:\s*([^;]*)/);
    if (tw) return tw[1].trim();
    return body.replace(/^[A-Za-z-]+\|/, '').trim();
  });
}

function stripTemplates(s: string): string {
  let prev: string;
  do { prev = s; s = s.replace(/\{\{[^{}]*\}\}/g, ''); } while (s !== prev);
  return s;
}

export function cleanWikitextInline(s: string): string {
  let t = s ?? '';
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<ref[^>]*\/>/g, '');
  t = resolveLangConv(t);
  t = stripTemplates(t);
  t = t.replace(/\[\[(?:File|Image|檔案|文件|分类|分類|Category):[^\]]*\]\]/gi, '');
  let prev: string;
  do { prev = t; t = t.replace(/\[\[(?:[^|\]]*\|)?([^\[\]]+)\]\]/g, '$1'); } while (t !== prev);
  t = t.replace(/'''?/g, '');
  t = t.replace(/<[^>]+>/g, '');
  return t.replace(/\s+/g, ' ').trim();
}

// 依 depth-0 的分隔字元切分：{{ }} 與 [[ ]] 內的分隔字元不算。
export function splitTopLevel(body: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; cur += two; i++; continue; }
    if (two === '}}' || two === ']]') { depth--; cur += two; i++; continue; }
    if (depth === 0 && body[i] === sep) { out.push(cur); cur = ''; continue; }
    cur += body[i];
  }
  out.push(cur);
  return out;
}

// 最外層 {{Infobox …}}／{{…信息框／資訊框}} 模板原文（含大括號）。用大括號配對而非 regex，因為值內有巢狀模板。
export function findInfobox(wikitext: string): string | null {
  const re = /\{\{\s*(?:Infobox\b|[^{}|\n]*(?:信息框|資訊框|资讯框))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    let depth = 0;
    for (let i = m.index; i < wikitext.length; i++) {
      if (wikitext.startsWith('{{', i)) { depth++; i++; continue; }
      if (wikitext.startsWith('}}', i)) { depth--; i++; if (depth === 0) return wikitext.slice(m.index, i + 1); }
    }
  }
  return null;
}

// 一個欄位值 → 多個項目：{{ubl|…}}／{{plainlist|…}}／{{unbulleted list|…}} 展開、<br> 與換行、* 條列。
function splitValueItems(value: string): string[] {
  const items: string[] = [];
  const listRe = /\{\{\s*(?:ubl|unbulleted list|plainlist|flatlist|hlist)\s*\|([\s\S]*?)\}\}/gi;
  let rest = value;
  let m: RegExpExecArray | null;
  while ((m = listRe.exec(value)) !== null) {
    for (const it of splitTopLevel(m[1], '|')) items.push(it);
    rest = rest.replace(m[0], '');
  }
  for (const piece of rest.split(/<br\s*\/?>|\n|^\*+/gim)) items.push(piece);
  return items.map((s) => s.replace(/^\s*[*#]+\s*/, '').trim()).filter(Boolean);
}

const firstWikilink = (s: string): string | undefined => {
  const m = s.match(/\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/);
  return m ? m[1].trim() : undefined;
};

// 人名：清理後去掉尾端／中段的括號附註；純數字或帶「子」「女」計數者（2子1女）不是人名。
function toName(item: string): string {
  const cleaned = cleanWikitextInline(item).replace(/[（(][^（）()]*[)）]/g, '').trim();
  if (!cleaned || /^\d+子\d*女?$|^\d+女$|^[\d\s]+$/.test(cleaned)) return '';
  return cleaned;
}

export function parseInfoboxRelations(wikitext: string): InfoboxRelation[] {
  const box = findInfobox(wikitext);
  if (!box) return [];
  const body = box.slice(2, -2); // 去掉最外層 {{ }}
  const out: InfoboxRelation[] = [];
  for (const part of splitTopLevel(body, '|').slice(1)) { // [0] 是模板名
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const field = part.slice(0, eq).trim().toLowerCase().replace(/\s+/g, '');
    if (!RELATION_FIELDS.has(field)) continue;
    for (const item of splitValueItems(part.slice(eq + 1).trim())) {
      const name = toName(item);
      if (!name) continue;
      const link = firstWikilink(item);
      out.push({ field, name, ...(link ? { wikilinkTitle: link } : {}), raw: item });
    }
  }
  return out;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run test/wikiRelations.test.ts`
Expected: PASS。若 `relatives` 的 `{{ubl}}` 展開順序或 `<br />` 切分失敗，先修 `splitValueItems`，不要改測試。

- [ ] **Step 5: Commit**

```bash
git add scraper/lib/wikiRelations.ts test/wikiRelations.test.ts
git commit -m "feat(scraper): wikitext infobox 關係欄位解析純函式"
```

---

### Task 11: `wikiRelations.ts`——關鍵句候選

**Files:**
- Modify: `scraper/lib/wikiRelations.ts`
- Test: `test/wikiRelations.test.ts`

**Interfaces:**
- Consumes: `cleanWikitextInline`、`resolveLangConv`（Task 10）
- Produces:
  ```ts
  export interface SentenceCandidate { sentence: string; keywords: string[]; wikilinks: string[] }
  export const FAMILY_KEYWORDS: RegExp; export const POLITICAL_KEYWORDS: RegExp;
  export function extractRelationSentences(wikitext: string): SentenceCandidate[]
  ```

- [ ] **Step 1: 寫失敗測試**

`test/wikiRelations.test.ts` 追加：

```ts
import { extractRelationSentences } from '../scraper/lib/wikiRelations';

describe('extractRelationSentences', () => {
  const wt = `{{Infobox officeholder|name=甲}}
'''甲'''是政治人物。<ref>r</ref>其妻[[乙 (醫師)|乙]]為醫師，兩人育有二子。
2014年甲在[[丙]]力挺下參選。[[File:x.jpg|thumb|說明]]
甲喜歡騎腳踏車。
== 家庭 ==
甲之弟[[丁]]曾任[[戊市]]市議員；師承[[己]]。`;
  const out = extractRelationSentences(wt);
  it('只留命中關鍵字的句子，並附上句內連結標題（排除 File）', () => {
    expect(out).toContainEqual({ sentence: '其妻乙為醫師，兩人育有二子', keywords: ['妻'], wikilinks: ['乙 (醫師)'] });
    expect(out).toContainEqual({ sentence: '2014年甲在丙力挺下參選', keywords: ['力挺'], wikilinks: ['丙'] });
    expect(out).toContainEqual({ sentence: '甲之弟丁曾任戊市市議員；師承己', keywords: ['之弟', '師承'], wikilinks: ['丁', '戊市', '己'] });
  });
  it('沒關鍵字的句子不出現；infobox 與 ref 內容不出現', () => {
    expect(out.some((s) => s.sentence.includes('腳踏車'))).toBe(false);
    expect(out.some((s) => s.sentence.includes('name=甲'))).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run test/wikiRelations.test.ts`
Expected: FAIL，`extractRelationSentences` 不存在。

- [ ] **Step 3: 實作**

在 `scraper/lib/wikiRelations.ts` 末尾加：

```ts
export interface SentenceCandidate { sentence: string; keywords: string[]; wikilinks: string[] }

// 家族／政治關鍵字（spec §7.1）。只是召回用的粗篩，精確與否由人審。
export const FAMILY_KEYWORDS = /妻|夫|配偶|之子|之女|之兄|之弟|之姊|之妹|長子|次子|長女|次女|女兒|兒子|父親|母親|胞兄|胞弟|胞姊|胞妹|兄長|弟弟|姊姊|妹妹|姪|甥|岳父|女婿|媳/g;
export const POLITICAL_KEYWORDS = /師承|恩師|門生|子弟兵|提拔|拔擢|幕僚|助理|辦公室主任|派系|新潮流|正國會|湧言會|蘇系|英系|支持|力挺|接班/g;

export function extractRelationSentences(wikitext: string): SentenceCandidate[] {
  let t = wikitext ?? '';
  const box = findInfobox(t);
  if (box) t = t.replace(box, '');
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<ref[^>]*\/>/g, '');
  t = resolveLangConv(t);
  t = stripTemplates(t);
  t = t.replace(/\[\[(?:File|Image|檔案|文件|分类|分類|Category):[^\]]*\]\]/gi, '');
  t = t.replace(/^[=]+.*[=]+\s*$/gm, ''); // 章節標題
  const out: SentenceCandidate[] = [];
  for (const rawSentence of t.split(/[。！？\n]/)) {
    const wikilinks: string[] = [];
    for (const m of rawSentence.matchAll(/\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/g)) wikilinks.push(m[1].trim());
    const sentence = cleanWikitextInline(rawSentence);
    if (!sentence) continue;
    const keywords = [...new Set([...sentence.matchAll(FAMILY_KEYWORDS), ...sentence.matchAll(POLITICAL_KEYWORDS)].map((m) => m[0]))];
    if (!keywords.length) continue;
    out.push({ sentence, keywords, wikilinks });
  }
  return out;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run test/wikiRelations.test.ts`
Expected: PASS。若「其妻乙為醫師」的關鍵字多抓到「夫」以外的字（例如「子」不在清單，不會），依實際輸出修正 regex 而非測試——但測試裡的三個 keywords 陣列必須維持。

- [ ] **Step 5: Commit**

```bash
git add scraper/lib/wikiRelations.ts test/wikiRelations.test.ts
git commit -m "feat(scraper): wikitext 關係關鍵句候選抽取"
```

---

### Task 12: 候選腳本 `wiki:discover-relations` 與執行

**Files:**
- Create: `scraper/wiki-discover-relations.ts`

**Interfaces:**
- Consumes: `loadEntitiesWiki`、`photoFileName`（借用檔名規則，Task 1）；`parseInfoboxRelations`、`extractRelationSentences`（Task 10–11）；`fetchPolite`
- Produces: `scraper/out-wiki-relations/<name>[-<distinct 前 8 字>].json`，格式見 spec §7.2

- [ ] **Step 1: 寫腳本**

建立 `scraper/wiki-discover-relations.ts`：

```ts
// 2 度關係候選：對 scraper/entities-wiki.json 每一位抓整頁 wikitext，解析 infobox 關係欄位與
// 關鍵句，輸出到 scraper/out-wiki-relations/<name>.json 供人工審定。只走一跳，不遞迴。
// 不寫 DB、不寫 curated——關係只能由人審定後追加到 relationships-curated.json。
//   pnpm run wiki:discover-relations
//   FORCE=1 pnpm run wiki:discover-relations      # 重抓已有輸出者
//   ONLY=柯文哲,朱立倫 pnpm run wiki:discover-relations
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchPolite } from './lib/fetchPolite';
import { loadEntitiesWiki, photoFileName } from './lib/entitiesWiki';
import { parseInfoboxRelations, extractRelationSentences } from './lib/wikiRelations';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, 'out-wiki-relations');
const API = 'https://zh.wikipedia.org/w/api.php';
const FORCE = !!process.env.FORCE;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWikitext(title: string): Promise<string | null> {
  const res = await fetchPolite(`${API}?${new URLSearchParams({ action: 'parse', page: title, prop: 'wikitext', redirects: '1', format: 'json' })}`);
  const j = await res.json();
  return j?.parse?.wikitext?.['*'] ?? null;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const rows = loadEntitiesWiki();
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
  const retrievedAt = new Date().toISOString().slice(0, 10);

  let done = 0, skip = 0, fail = 0, totalInfobox = 0, totalSentences = 0;
  for (const r of rows) {
    if (only && !only.has(r.name)) continue;
    const outFile = join(OUT_DIR, photoFileName(r.name, r.distinct).replace(/\.jpg$/, '.json'));
    if (!FORCE && existsSync(outFile)) { skip++; continue; }
    try {
      const wt = await fetchWikitext(r.wikiTitle);
      await sleep(500);
      if (!wt) { fail++; console.log('✗', r.name, '查無 wikitext'); continue; }
      const infobox = parseInfoboxRelations(wt);
      const sentences = extractRelationSentences(wt);
      writeFileSync(outFile, JSON.stringify({
        subject: r.name, distinct: r.distinct ?? '', wikipediaUrl: r.wikipediaUrl, retrievedAt, infobox, sentences,
      }, null, 2));
      done++; totalInfobox += infobox.length; totalSentences += sentences.length;
      console.log('✓', r.name, `infobox ${infobox.length}、句 ${sentences.length}`);
    } catch (e) {
      fail++; console.log('✗', r.name, e instanceof Error ? e.message : String(e));
    }
  }
  console.log(`\n完成：${done} 人（跳過 ${skip}、失敗 ${fail}）；infobox 項目 ${totalInfobox}、關鍵句 ${totalSentences} → scraper/out-wiki-relations/`);
  console.log('下一步：逐檔審定，追加到 scraper/relationships-curated.json（subjectKind: "entity"）。');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: 執行**

Run: `pnpm run wiki:discover-relations`
Expected: 對照表每人一個 JSON；總結列印 infobox 項目與關鍵句數。

- [ ] **Step 3: Commit**

```bash
git add scraper/wiki-discover-relations.ts
git commit -m "feat(scraper): 2 度關係候選腳本（infobox＋關鍵句）"
```

---

### Task 13: 人工審定 2 度關係 → curated → 重匯 → 驗收

**Files:**
- Modify: `scraper/relationships-curated.json`（追加 `subjectKind: "entity"` 列）
- Modify: `scraper/entities-wiki.json`（若審定中發現需 `distinct` 的撞名）
- Regenerate: `src/data/graph.json`

**Interfaces:**
- Consumes: `scraper/out-wiki-relations/*.json`（Task 12）；兩輪匯入（Task 9）

- [ ] **Step 1: 逐檔審定**

對每個 `scraper/out-wiki-relations/<name>.json`，依 spec §7.3：
- infobox 項目：配偶／父母／子女／手足／親屬 → `spouse` / `parent_child`（`parentName` 填父母那方姓名）/ `sibling` / `relative`。只有名字沒有連結、也無法從內文佐證身分的（如「柯承發（父）」），仍可收為 `family_member` entity，`counterpartRole` 寫「柯文哲之父」。
- 關鍵句：只收句子本身明確陳述的關係；「支持」「力挺」單句且無 ref 不收；「師承」「恩師」「子弟兵」「幕僚」「辦公室主任」「助理」可對應 `mentor` / `aide`；「派系」「新潮流」等對應 `faction`（counterpart 為既有派系 entity 時，`counterpartName` 必須與 curated 既有寫法一字不差，例如「新潮流系」）。
- counterpart 若在名冊且唯一（用 `grep -c '"name": "<名>"' src/data/officials.json` 或直接查 DB）→ `counterpartKind: "official"`；否則 `entity`。
- counterpart 若與既有 entity 或名冊同名但確認不同人 → `counterpartDistinct`。
- 不確定就不收。每筆 `sourceUrl` = 該 subject 的 `wikipediaUrl`，`sourceType: "wiki"`。

每列格式（追加在檔案末尾、保持 JSON 合法）：

```json
  {
    "subject": "柯文哲",
    "subjectKind": "entity",
    "counterpartName": "陳佩琪",
    "counterpartRole": "醫師、柯文哲之妻",
    "counterpartKind": "entity",
    "counterpartEntityType": "family_member",
    "relationType": "spouse",
    "parentName": "",
    "note": "1991年結婚（維基百科柯文哲條目信息框）。",
    "sourceUrl": "https://zh.wikipedia.org/wiki/%E6%9F%AF%E6%96%87%E5%93%B2",
    "sourceType": "wiki"
  }
```

subject 有 `distinct` 者加 `"subjectDistinct": "<與 entities-wiki.json 相同的值>"`。

- [ ] **Step 2: 重匯與匯出**

Run: `pnpm run import:relationships`
Expected: 「匯入完成」筆數 = 315 + 新增列數 − skip；**無**「2 度關係 subject 找不到」警示；fell-through 與覆核警示逐條看過（新出現的同名合併疑慮要處理：加 `counterpartDistinct` 後重跑）。

Run: `pnpm run export:graph`
Expected: 節點數與邊數上升；無 validation error。

- [ ] **Step 3: 驗收**

Run: `node -e "const g=require('./src/data/graph.json');const ee=g.edges.filter(e=>e.source.startsWith('entity:')&&e.target.startsWith('entity:'));console.log('nodes',g.nodes.length,'edges',g.edges.length,'entity-entity edges',ee.length)"`
Expected: `entity-entity edges` > 0。

Run: `pnpm test && pnpm build`
Expected: PASS、build 成功。

`pnpm dev` 開一位與柯文哲有關係的立委檔案頁：第二層出現柯文哲的關係人（較小、較淡）；`/graph` 搜尋「柯文哲」顯示其整個關係網含新關係人。

- [ ] **Step 4: Commit**

```bash
git add scraper/relationships-curated.json scraper/entities-wiki.json src/data/graph.json
git commit -m "feat(graph): 審定 N 筆 2 度關係（M 位外部人物的維基條目），重匯匯出"
```

---

### Task 14: 文件收尾

**Files:**
- Modify: `docs/superpowers/specs/2026-08-25-relationship-graph-wiki-expansion-design.md`（§1.1 加「完成後」數字）
- Modify: 本計畫（勾選 checkbox）
- Modify: `docs/superpowers/plans/2026-07-29-relationship-graph-visual.md`（把 47 個未勾的 checkbox 勾起來——該計畫早已全部交付，見 merge commit f941078）

- [ ] **Step 1: spec 補完成數字**

在 §1.1 之後加：

```markdown
### 1.2 完成後（YYYY-MM-DD）

- 對照表 N 筆；照片 M 張（授權不符／無主圖 K 筆，noPhoto J 筆）。
- 新增 2 度關係 R 筆；graph.json X 節點／Y 邊，其中 entity→entity 邊 Z 條。
```

填實際數字。

- [ ] **Step 2: 勾 checkbox 並 commit**

```bash
git add docs/superpowers
git commit -m "docs: 關係圖維基擴充完成數字，並補勾兩份計畫的 checkbox"
```

---

## Self-review（已檢）

- **Spec 覆蓋**：§3 對照表→T1–2；§4 resolve→T2；§5 照片與授權呈現→T3–4、T7；§6.1–6.5 import→T6、T8–9；§7 萃取與審定→T10–13；§8 匯出前端→T5、T7；§9 測試→T1、T3、T5、T7、T8、T10、T11；§10 邊界（SVG、授權不符、noPhoto、subjectDistinct 不一致）→T4、T9；§11 交付順序＝Stage 1/2。
- **型別一致**：`entityWikiKey` 在 T1 定義、T6／T8 使用；`EntityWiki.photo.file` 在 T4 寫入、T5 由 `photoCredit()` 組字串、T6 寫入 `photo_url`；`resolveSubject` 回傳 `{type,id}|{skip}` 在 T8 定義、T9 使用；`CyNode.data.description/wikipediaUrl/photoCredit` 在 T7 定義並於 Svelte 讀取。
- **無佔位**：所有步驟含實際程式碼或明確的人工判準。
