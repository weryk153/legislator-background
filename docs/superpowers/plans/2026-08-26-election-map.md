# 2026 九合一選舉分頁與政治地圖 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/elections` 分頁，以可逐層下鑽（全國 → 鄉鎮市區 → 村里）的地圖呈現九合一各級公職現任者的政黨版圖。

**Architecture:** 建置期由 `scraper/` 讀中選會投開票 CSV 與行政區界線 TopoJSON，合併成分層 JSON 輸出到 `public/data/map/`；前端 Svelte 元件以 d3-geo 投影繪製 SVG，逐層 `fetch` 下一層資料。所有資料解析與規則判定為純函式，走 TDD；地圖元件以實際開頁面驗證。

**Tech Stack:** Astro 5、Svelte 5（runes）、vitest、tsx。新增執行期依賴 `d3-geo`、`topojson-client`；新增開發依賴 `mapshaper`。

**Spec:** `docs/superpowers/specs/2026-08-26-election-map-design.md`

## Global Constraints

- 2022 資料根目錄：`scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉/`。CSV 為 **UTF-8、無標頭列**。
- 2022 的 `C1`、`T1`、`T2`、`T3` 之下再分 `city/` 與 `prv/`；`D1`、`D2`、`R1`、`R2`、`R3`、`V1` 無此分層。
- **2018 的目錄命名與 2022 完全不同**：用中文名（`直轄市市長`、`縣市市長`、`縣市鄉鎮市長`…）而非 `C1`/`T1` 代碼，且縣市長拆成「直轄市市長」與「縣市市長」兩個目錄。不可假設兩年格式一致。
- 行政區樹的**唯一權威來源**是 2022 的 `V1/elbase.csv`（8,147 列：1 列全國、22 列縣市、368 列鄉鎮市區、7,756 列村里）。其他類別的 elbase 不完整。
- 直轄市在中選會代碼中以**省市別**表示（`63` 臺北、`64` 高雄、`65` 新北、`66` 臺中、`67` 臺南、`68` 桃園），其縣市別為 `000`；省轄縣市為省市別 `09`（福建省）或 `10`（臺灣省）加縣市別 `001`–`020`。判斷縣市層不可只看縣市別欄位。
- 無黨籍的政黨代號固定為 `999`，名稱「無黨籍及未經政黨推薦」。
- **補選與重行選舉是第三種格式**：檔名為 `cand.csv`／`prof.csv`，有 UTF-8 BOM 與標頭列，政黨欄是名稱而非代號，且**沒有當選註記**——當選者須由 `prof.csv` 的分號次得票跨投開票所加總後取最高票。
- **執行期要 fetch 的資料一律放 `public/data/`**，不可放 `src/data/`——後者只在建置期可用，放錯會 404。站上既有的 `public/data/donors.json` 即此慣例。
- 名稱比對不到的一律**列報**，不做模糊猜測。猜錯會把某村的村里長掛到另一村頭上。
- 界線檔須取 **2022 年版**（選舉當時），非現行版。
- 區域代碼一律用中選會五段代碼以 `-` 相連並保留前導零（如 `63-000-00-010-0002`）。
- 測試檔放 `test/*.test.ts`，用 `describe`/`it`/`expect` from `vitest`，測試敘述用正體中文。
- 每次提交訊息結尾附 `Claude-Session: https://claude.ai/code/session_01FNzhZHTnhsCyQMi17u9vZ9`。

---

## File Structure

| 檔案 | 職責 |
|---|---|
| `scraper/lib/cecVoteData.ts` | CSV 解析、代碼工具。純函式，無 I/O。 |
| `scraper/lib/electionRules.ts` | 連任限制、席次統計。純函式，無 I/O。 |
| `scraper/lib/cecByElection.ts` | 補選與重行選舉的當選者推導。純函式，無 I/O。 |
| `scraper/lib/areaMatch.ts` | 名稱正規化與複合鍵索引。純函式，無 I/O。 |
| `scraper/extract-vote-history.ts` | 從 votedata.zip 解出 2018 資料（Big5 檔名）。 |
| `scraper/fetch-boundaries.ts` | 界線檔轉 TopoJSON。 |
| `scraper/build-election-map.ts` | 合併輸出 `public/data/map/`。 |
| `src/lib/mapTypes.ts` | 前後端共用的地圖資料型別。 |
| `src/components/ElectionMap.svelte` | 地圖繪製、下鑽、鍵盤操作。 |
| `src/components/ElectionSidebar.svelte` | 側欄：當前行政區的首長、席次、資料深度標示。 |
| `src/components/ElectionPanel.svelte` | 容器：保存選取狀態，串接地圖與側欄。 |
| `src/pages/elections.astro` | 頁面骨架、倒數、側欄。 |
| `test/cecVoteData.test.ts`、`test/cecByElection.test.ts`、`test/electionRules.test.ts`、`test/areaMatch.test.ts` | 對應測試。 |

---

### Task 1: 行政區樹解析與代碼工具

**Files:**
- Create: `scraper/lib/cecVoteData.ts`
- Test: `test/cecVoteData.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  ```ts
  export type AreaLevel = 'county' | 'town' | 'village';
  export interface AreaNode { code: string; level: AreaLevel; name: string; parent: string | null }
  export function parseElbase(csv: string): AreaNode[];
  export function countyCodeOf(areaCode: string): string;
  export function townCodeOf(areaCode: string): string;
  ```

- [ ] **Step 1: 寫失敗測試**

建立 `test/cecVoteData.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseElbase, countyCodeOf, townCodeOf } from '../scraper/lib/cecVoteData';

const V1_ELBASE = 'scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉/V1/elbase.csv';

describe('parseElbase：行政區樹', () => {
  const csv = [
    '00,000,00,000,0000,全國',
    '63,000,00,000,0000,臺北市',
    '63,000,00,010,0000,松山區',
    '63,000,00,010,0002,莊敬里',
    '09,007,00,000,0000,連江縣',
    '09,007,00,010,0000,南竿鄉',
    '09,007,00,010,0001,介壽村',
  ].join('\n');

  it('略過「全國」列——它不是行政區', () => {
    expect(parseElbase(csv).some((a) => a.name === '全國')).toBe(false);
  });

  it('直轄市以省市別辨識，其縣市別為 000，不可誤判為非縣市層', () => {
    expect(parseElbase(csv).find((a) => a.name === '臺北市'))
      .toEqual({ code: '63-000-00-000-0000', level: 'county', name: '臺北市', parent: null });
  });

  it('省轄縣市的省市別為 09 或 10，縣市別才是識別碼', () => {
    expect(parseElbase(csv).find((a) => a.name === '連江縣'))
      .toEqual({ code: '09-007-00-000-0000', level: 'county', name: '連江縣', parent: null });
  });

  it('鄉鎮市區掛在所屬縣市之下', () => {
    expect(parseElbase(csv).find((a) => a.name === '松山區'))
      .toEqual({ code: '63-000-00-010-0000', level: 'town', name: '松山區', parent: '63-000-00-000-0000' });
  });

  it('村里掛在所屬鄉鎮市區之下', () => {
    expect(parseElbase(csv).find((a) => a.name === '莊敬里'))
      .toEqual({ code: '63-000-00-010-0002', level: 'village', name: '莊敬里', parent: '63-000-00-010-0000' });
  });
});

describe('countyCodeOf / townCodeOf：代碼上溯', () => {
  it('議員的選區代碼可上溯到縣市——席次要按縣市彙整，而選區別不是行政區', () => {
    expect(countyCodeOf('10-005-01-000-0000')).toBe('10-005-00-000-0000');
  });
  it('村里代碼可上溯到縣市與鄉鎮市區', () => {
    expect(countyCodeOf('63-000-00-010-0002')).toBe('63-000-00-000-0000');
    expect(townCodeOf('63-000-00-010-0002')).toBe('63-000-00-010-0000');
  });
  it('已是縣市層者上溯後不變', () => {
    expect(countyCodeOf('63-000-00-000-0000')).toBe('63-000-00-000-0000');
  });
});

describe('parseElbase：對真實資料', () => {
  const areas = parseElbase(readFileSync(V1_ELBASE, 'utf8'));

  it('層級數與 2022 年的行政區數相符', () => {
    const n = (l: string) => areas.filter((a) => a.level === l).length;
    expect(n('county')).toBe(22);
    expect(n('town')).toBe(368);
    expect(n('village')).toBe(7756);
  });

  it('每個非縣市節點的 parent 都存在於樹中——parent 斷鏈會讓整張地圖組不起來', () => {
    const codes = new Set(areas.map((a) => a.code));
    expect(areas.filter((a) => a.parent && !codes.has(a.parent))).toEqual([]);
  });

  it('每個村里的 townCodeOf 都指向存在的鄉鎮市區', () => {
    const towns = new Set(areas.filter((a) => a.level === 'town').map((a) => a.code));
    const bad = areas.filter((a) => a.level === 'village' && !towns.has(townCodeOf(a.code)));
    expect(bad).toEqual([]);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `pnpm exec vitest run test/cecVoteData.test.ts`
Expected: FAIL，找不到模組 `../scraper/lib/cecVoteData`。

- [ ] **Step 3: 寫最小實作**

建立 `scraper/lib/cecVoteData.ts`：

```ts
// 中選會投開票資料的解析。純字串處理，無 I/O。
//
// CSV 為 UTF-8、無標頭列。五段代碼是「省市別, 縣市別, 選區別, 鄉鎮市區別, 村里別」，
// 各段位數固定（2,3,2,3,4），前導零有意義，一律以字串保留。

export type AreaLevel = 'county' | 'town' | 'village';

export interface AreaNode {
  code: string;
  level: AreaLevel;
  name: string;
  parent: string | null;
}

const seg = (code: string): string[] => code.split('-');

/** 上溯到所屬縣市的代碼。選區別、鄉鎮市區別、村里別一律歸零。 */
export function countyCodeOf(areaCode: string): string {
  const s = seg(areaCode);
  return [s[0], s[1], '00', '000', '0000'].join('-');
}

/** 上溯到所屬鄉鎮市區的代碼。村里別歸零。 */
export function townCodeOf(areaCode: string): string {
  const s = seg(areaCode);
  return [s[0], s[1], s[2], s[3], '0000'].join('-');
}

/**
 * 解析 elbase.csv 為行政區樹。
 *
 * 層級不能只看「縣市別」欄位：直轄市在中選會代碼裡是用**省市別**表示的
 * （63 臺北、64 高雄、65 新北、66 臺中、67 臺南、68 桃園），其縣市別固定為 000，
 * 與「全國」列的 000 撞在一起。故以「鄉鎮市區別／村里別是否為空碼」判斷層級，
 * 並單獨排除省市別為 00 的全國列。
 */
export function parseElbase(csv: string): AreaNode[] {
  const out: AreaNode[] = [];
  for (const line of (csv ?? '').split('\n')) {
    const f = line.split(',').map((s) => s.trim());
    if (f.length < 6 || !f[5]) continue;
    const [prv, city, dist, town, village] = f;
    if (prv === '00') continue; // 全國
    const code = f.slice(0, 5).join('-');
    if (village !== '0000') {
      out.push({ code, level: 'village', name: f[5], parent: [prv, city, dist, town, '0000'].join('-') });
    } else if (town !== '000') {
      out.push({ code, level: 'town', name: f[5], parent: [prv, city, dist, '000', '0000'].join('-') });
    } else {
      out.push({ code, level: 'county', name: f[5], parent: null });
    }
  }
  return out;
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `pnpm exec vitest run test/cecVoteData.test.ts`
Expected: PASS，11 個測試全過。

- [ ] **Step 5: 提交**

```bash
git add scraper/lib/cecVoteData.ts test/cecVoteData.test.ts
git commit -m "feat(elections): 中選會行政區樹解析與代碼上溯

Claude-Session: https://claude.ai/code/session_01FNzhZHTnhsCyQMi17u9vZ9"
```

---

### Task 2: 候選人與政黨解析、當選者彙整

**Files:**
- Modify: `scraper/lib/cecVoteData.ts`
- Test: `test/cecVoteData.test.ts`

**Interfaces:**
- Consumes: Task 1 全部
- Produces:
  ```ts
  export interface Candidate {
    areaCode: string; number: number; name: string; partyCode: string;
    sex: '1' | '2'; birthDate: string; age: number; education: string;
    incumbent: boolean; elected: boolean;
  }
  export function parseElcand(csv: string): Candidate[];
  export function parseElpaty(csv: string): Map<string, string>;
  export function winnersByArea(cands: Candidate[]): Map<string, Candidate[]>;
  export const INDEPENDENT_PARTY_CODE = '999';
  ```

- [ ] **Step 1: 寫失敗測試**

把 `test/cecVoteData.test.ts` 的 import 改為：

```ts
import { parseElbase, countyCodeOf, townCodeOf, parseElcand, parseElpaty, winnersByArea, INDEPENDENT_PARTY_CODE } from '../scraper/lib/cecVoteData';
```

並在檔末追加：

```ts
describe('parseElcand：候選人', () => {
  // 取自 V1/elcand.csv 與 C1/prv/elcand.csv 的真實列
  const csv = [
    '09,007,00,010,0001,1,陳春開,16,1,0440621,67,金馬地區,高中(職)以下,N, , ',
    '09,007,00,010,0001,2,陳美貴,1,1,0520630,59,金馬地區,高中(職)以下,Y,*, ',
    '10,005,00,000,0000,1,鍾東錦,999,1,0520102,59,臺灣省,大學,N,*, ',
  ].join('\n');

  it('當選註記是空白包夾的星號，須去空白後判斷', () => {
    expect(parseElcand(csv).map((c) => c.elected)).toEqual([false, true, true]);
  });

  it('現任註記 Y/N 轉為布林', () => {
    expect(parseElcand(csv).map((c) => c.incumbent)).toEqual([false, true, false]);
  });

  it('政黨代號保留字串——999 是無黨籍，轉成數字會失去代號語意', () => {
    expect(parseElcand(csv)[2].partyCode).toBe(INDEPENDENT_PARTY_CODE);
  });

  it('出生日期保留民國格式原樣，供「同姓名不同人」的辨識用', () => {
    expect(parseElcand(csv)[2].birthDate).toBe('0520102');
  });

  it('所屬區代碼與 elbase 的代碼格式一致', () => {
    expect(parseElcand(csv)[0].areaCode).toBe('09-007-00-010-0001');
    expect(parseElcand(csv)[2].areaCode).toBe('10-005-00-000-0000');
  });

  it('欄位不足的殘列略過，不產生半殘的候選人', () => {
    expect(parseElcand('10,005,00,000,0000,1,某某')).toEqual([]);
  });
});

describe('parseElpaty：政黨代碼表', () => {
  it('代號對名稱', () => {
    const m = parseElpaty('1,中國國民黨\n16,民主進步黨\n999,無黨籍及未經政黨推薦');
    expect(m.get('1')).toBe('中國國民黨');
    expect(m.get('999')).toBe('無黨籍及未經政黨推薦');
  });
});

describe('winnersByArea：當選者彙整', () => {
  const cands = parseElcand([
    '09,007,00,010,0001,1,陳春開,16,1,0440621,67,金馬地區,高中(職)以下,N, , ',
    '09,007,00,010,0001,2,陳美貴,1,1,0520630,59,金馬地區,高中(職)以下,Y,*, ',
    '10,005,01,000,0000,1,甲某,1,1,0500101,60,臺灣省,大學,N,*, ',
    '10,005,01,000,0000,2,乙某,16,2,0500101,60,臺灣省,大學,N,*, ',
  ].join('\n'));

  it('只收當選者', () => {
    expect([...winnersByArea(cands).values()].flat().map((c) => c.name))
      .toEqual(['陳美貴', '甲某', '乙某']);
  });

  it('議員與代表是複數席，同一區可有多位當選者', () => {
    expect(winnersByArea(cands).get('10-005-01-000-0000')?.length).toBe(2);
  });

  it('落選者所在的區不會出現在結果中', () => {
    expect(winnersByArea(parseElcand(
      '10,001,00,000,0000,1,丙某,1,1,0500101,60,臺灣省,大學,N, , ')).size).toBe(0);
  });
});

describe('parseElcand：對真實資料的席次總數', () => {
  const ROOT = 'scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉';
  // C1/T1/T2/T3 之下再分 city/ 與 prv/；其餘類別的 CSV 直接位於類別目錄下
  const CASES: [string, string[], number][] = [
    ['C1', ['city', 'prv'], 21],   // 21 而非 22：嘉義市長延後重行選舉，資料另存他處
    ['T1', ['city', 'prv'], 837],
    ['T2', ['city', 'prv'], 34],
    ['T3', ['city', 'prv'], 35],
    ['D1', [''], 198],
    ['D2', [''], 6],
    ['R1', [''], 2001],
    ['R2', [''], 70],
    ['R3', [''], 50],
    ['V1', [''], 7740],
  ];

  for (const [cat, subs, expected] of CASES) {
    it(`${cat} 的當選席次為 ${expected}`, () => {
      const cands = subs.flatMap((s) =>
        parseElcand(readFileSync([ROOT, cat, s, 'elcand.csv'].filter(Boolean).join('/'), 'utf8')));
      expect(cands.filter((c) => c.elected).length).toBe(expected);
    });
  }

  it('十類合計為九合一的完整席次', () => {
    expect(CASES.reduce((n, [, , e]) => n + e, 0)).toBe(10992);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `pnpm exec vitest run test/cecVoteData.test.ts`
Expected: FAIL，`parseElcand is not a function`。

- [ ] **Step 3: 寫最小實作**

在 `scraper/lib/cecVoteData.ts` 追加：

```ts
export interface Candidate {
  areaCode: string;
  number: number;
  name: string;
  partyCode: string;
  sex: '1' | '2';
  birthDate: string;
  age: number;
  education: string;
  incumbent: boolean;
  elected: boolean;
}

/** 無黨籍。中選會以固定代號 999 表示「無黨籍及未經政黨推薦」。 */
export const INDEPENDENT_PARTY_CODE = '999';

/**
 * 解析 elcand.csv。
 *
 * 欄位：省市別, 縣市別, 選區別, 鄉鎮市區別, 村里別, 號次, 姓名, 政黨代號, 性別,
 *       出生日期, 年齡, 出生地, 學歷, 是否現任(Y/N), 當選註記(*), 副手註記
 *
 * 當選註記在原始檔中是「空白包夾的星號」（`,*, `），直接比對 '*' 會全部漏掉。
 * 政黨代號一律以字串保留：轉成數字會讓 999 這類代號失去「這是代碼不是數量」的語意。
 */
export function parseElcand(csv: string): Candidate[] {
  const out: Candidate[] = [];
  for (const line of (csv ?? '').split('\n')) {
    const f = line.split(',');
    if (f.length < 15) continue;
    const t = (i: number) => (f[i] ?? '').trim();
    if (!t(6)) continue;
    out.push({
      areaCode: f.slice(0, 5).map((s) => s.trim()).join('-'),
      number: Number(t(5)),
      name: t(6),
      partyCode: t(7),
      sex: t(8) === '2' ? '2' : '1',
      birthDate: t(9),
      age: Number(t(10)),
      education: t(12),
      incumbent: t(13) === 'Y',
      elected: t(14) === '*',
    });
  }
  return out;
}

/** 解析 elpaty.csv：政黨代號 → 政黨名稱。 */
export function parseElpaty(csv: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of (csv ?? '').split('\n')) {
    const f = line.split(',').map((s) => s.trim());
    if (f.length < 2 || !f[0] || !f[1]) continue;
    m.set(f[0], f[1]);
  }
  return m;
}

/**
 * 依區彙整當選者。
 *
 * 首長與村里長每區一席，議員與代表每區數席，故值為陣列而非單一候選人。
 * 沒有當選者的區不建立條目——結果的鍵即「有人當選的區」。
 */
export function winnersByArea(cands: Candidate[]): Map<string, Candidate[]> {
  const m = new Map<string, Candidate[]>();
  for (const c of cands) {
    if (!c.elected) continue;
    m.set(c.areaCode, [...(m.get(c.areaCode) ?? []), c]);
  }
  return m;
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `pnpm exec vitest run test/cecVoteData.test.ts`
Expected: PASS，33 個測試全過。

- [ ] **Step 5: 提交**

```bash
git add scraper/lib/cecVoteData.ts test/cecVoteData.test.ts
git commit -m "feat(elections): 候選人、政黨解析與當選者彙整

Claude-Session: https://claude.ai/code/session_01FNzhZHTnhsCyQMi17u9vZ9"
```

---

### Task 3: 解出 2018 選舉資料

連任限制要判斷「2018 與 2022 都當選」，但本機只解壓過 2022。2018 的資料在 `scraper/out-roster/votedata.zip` 裡（該檔另含 1994 年以降的歷屆資料）。

**Files:**
- Create: `scraper/extract-vote-history.ts`
- Create: `scraper/out-roster/cec/voteData/2018-107年地方公職人員選舉/`（解壓產物）
- Modify: `package.json`（script `extract:vote-history`）
- Modify: `.gitignore`（若既有 2022 產物已忽略，比照辦理）

**Interfaces:**
- Consumes: 無
- Produces: 檔案系統上的 2018 資料目錄，供 Task 4 讀取。

- [ ] **Step 1: 確認 zip 內的路徑與檔名編碼**

Run:

```bash
python3 -c "
import zipfile
z=zipfile.ZipFile('scraper/out-roster/votedata.zip')
dec=lambda s: s.encode('cp437').decode('big5','replace')
for n in z.namelist():
    d=dec(n)
    if '2018-107' in d and d.endswith('elcand.csv'): print(d)
"
```

Expected: 印出 14 個目錄的 elcand.csv 路徑，目錄名為中文（`直轄市市長`、`縣市市長`、`縣市鄉鎮市長`…）。

zip 內的檔名以 Big5 編碼儲存，Python 的 zipfile 會用 cp437 解讀，故須 `.encode('cp437').decode('big5')` 還原。直接用 `unzip` 會得到亂碼目錄名。

- [ ] **Step 2: 寫解壓腳本**

建立 `scraper/extract-vote-history.ts`：

```ts
// 從 votedata.zip 解出 2018 年地方公職人員選舉資料。
//
// 為什麼要另寫腳本而不用 unzip：zip 內的檔名以 Big5 編碼儲存，unzip 解出來會是亂碼
// 目錄名，後續程式對不到路徑。
//
// 為什麼要 2018：連任限制的判定條件是「2018 與 2022 連續兩屆當選」，只有 2022 算不出來。
//
//   pnpm run extract:vote-history
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import AdmZip from 'adm-zip';

const ZIP = 'scraper/out-roster/votedata.zip';
const OUT = 'scraper/out-roster/cec/voteData';
const WANT = '2018-107年地方公職人員選舉';

/** zip 內檔名為 Big5；Node 以 latin1 讀取原始位元組後再轉碼還原。 */
function decodeName(raw: Buffer): string {
  return new TextDecoder('big5').decode(raw);
}

const zip = new AdmZip(ZIP);
let n = 0;
for (const entry of zip.getEntries()) {
  const name = decodeName(entry.rawEntryName);
  if (!name.includes(WANT) || entry.isDirectory) continue;
  // 只取 WANT 之後的相對路徑，丟掉 zip 內層層的 votedata/votedata/voteData 前綴
  const rel = name.slice(name.indexOf(WANT));
  const dest = join(OUT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, entry.getData());
  n++;
}
console.log(`解出 ${n} 個檔案到 ${join(OUT, WANT)}`);
```

安裝依賴並加 script：

```bash
pnpm add -D adm-zip @types/adm-zip
```

`package.json` 的 `scripts` 加入：

```json
"extract:vote-history": "tsx scraper/extract-vote-history.ts"
```

- [ ] **Step 3: 執行解壓並驗收**

```bash
pnpm run extract:vote-history
ls "scraper/out-roster/cec/voteData/2018-107年地方公職人員選舉"
```

Expected: 目錄名為可讀中文（非亂碼），含 `直轄市市長`、`縣市市長` 等 14 個子目錄。

驗證 2018 縣市長當選數：

```bash
python3 -c "
import csv,glob
n=0
for p in ['直轄市市長','縣市市長']:
    for row in csv.reader(open(f'scraper/out-roster/cec/voteData/2018-107年地方公職人員選舉/{p}/elcand.csv',encoding='utf-8')):
        if len(row)>14 and row[14].strip()=='*': n+=1
print('2018 縣市長當選', n)"
```

Expected: 22（2018 年 22 個縣市長全數選出，無延後選舉）。

若數字不是 22，代表欄位位置與 2022 不同，須先查明再進 Task 4——**不可**直接改判斷條件遷就結果。

- [ ] **Step 4: 提交**

```bash
git add scraper/extract-vote-history.ts package.json pnpm-lock.yaml .gitignore
git commit -m "feat(elections): 解出 2018 選舉資料供連任限制判定

Claude-Session: https://claude.ai/code/session_01FNzhZHTnhsCyQMi17u9vZ9"
```

---

### Task 4: 連任限制與席次統計

**Files:**
- Create: `scraper/lib/electionRules.ts`
- Test: `test/electionRules.test.ts`

**Interfaces:**
- Consumes: `Candidate`、`INDEPENDENT_PARTY_CODE`、`countyCodeOf`（Task 1、2）；2018 資料（Task 3）
- Produces:
  ```ts
  export interface TermRecord { year: number; countyCode: string; name: string; birthDate: string }
  export interface TermLimitResult { limited: boolean; reason: string }
  export function toTermRecords(year: number, winners: Candidate[]): TermRecord[];
  export function termLimited(person: { name: string; birthDate: string }, history: TermRecord[], countyCode: string, upcomingYear: number): TermLimitResult;
  export interface SeatCount { partyCode: string; partyName: string; seats: number }
  export function seatBreakdown(winners: Candidate[], parties: Map<string, string>): SeatCount[];
  ```

- [ ] **Step 1: 寫失敗測試**

建立 `test/electionRules.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { toTermRecords, termLimited, seatBreakdown, type TermRecord } from '../scraper/lib/electionRules';
import { parseElcand, parseElpaty } from '../scraper/lib/cecVoteData';

describe('toTermRecords：把當選者轉成任期紀錄', () => {
  it('選區代碼上溯為縣市代碼——連任限制綁在縣市，不是選區', () => {
    const w = parseElcand('10,005,00,000,0000,1,鍾東錦,999,1,0520102,59,臺灣省,大學,N,*, ');
    expect(toTermRecords(2022, w)).toEqual([
      { year: 2022, countyCode: '10-005-00-000-0000', name: '鍾東錦', birthDate: '0520102' },
    ]);
  });
});

describe('termLimited：縣市長連任一次為限', () => {
  const 苗栗 = '10-005-00-000-0000';
  const 王 = { name: '王某', birthDate: '0500101' };
  const rec = (year: number, countyCode: string, name = '王某', birthDate = '0500101'): TermRecord =>
    ({ year, countyCode, name, birthDate });

  it('連續兩屆當選者不得再選', () => {
    expect(termLimited(王, [rec(2018, 苗栗), rec(2022, 苗栗)], 苗栗, 2026).limited).toBe(true);
  });

  it('只當選一屆者可以再選', () => {
    expect(termLimited(王, [rec(2022, 苗栗)], 苗栗, 2026).limited).toBe(false);
  });

  it('隔屆當選不算連任，不受限', () => {
    expect(termLimited(王, [rec(2014, 苗栗), rec(2022, 苗栗)], 苗栗, 2026).limited).toBe(false);
  });

  it('在不同縣市各當選一屆不受限——限制綁在同一縣市的職位上', () => {
    expect(termLimited(王, [rec(2018, '10-001-00-000-0000'), rec(2022, 苗栗)], 苗栗, 2026).limited).toBe(false);
  });

  it('同名但出生日期不同者視為不同人，不可合併計算', () => {
    const history = [rec(2018, 苗栗, '王某', '0300101'), rec(2022, 苗栗, '王某', '0500101')];
    expect(termLimited(王, history, 苗栗, 2026).limited).toBe(false);
  });

  it('受限時說明理由，供頁面直接顯示', () => {
    expect(termLimited(王, [rec(2018, 苗栗), rec(2022, 苗栗)], 苗栗, 2026).reason)
      .toBe('已連任一次（2018、2022 當選），依地方制度法不得再選');
  });
});

describe('seatBreakdown：政黨席次統計', () => {
  const parties = parseElpaty('1,中國國民黨\n16,民主進步黨\n999,無黨籍及未經政黨推薦');
  const winners = parseElcand([
    '10,005,01,000,0000,1,甲,1,1,0500101,60,臺灣省,大學,N,*, ',
    '10,005,01,000,0000,2,乙,1,2,0500101,60,臺灣省,大學,N,*, ',
    '10,005,02,000,0000,1,丙,16,1,0500101,60,臺灣省,大學,N,*, ',
    '10,005,02,000,0000,2,丁,999,1,0500101,60,臺灣省,大學,N,*, ',
  ].join('\n'));

  it('依席次由多到少排序', () => {
    expect(seatBreakdown(winners, parties).map((s) => [s.partyName, s.seats]))
      .toEqual([['中國國民黨', 2], ['民主進步黨', 1], ['無黨籍及未經政黨推薦', 1]]);
  });

  it('無黨籍照實計入，不併入其他也不略去——多數村里長是無黨籍，略去等於謊報版圖', () => {
    expect(seatBreakdown(winners, parties).some((s) => s.partyCode === '999')).toBe(true);
  });

  it('代碼表查無的政黨以代號顯示，不靜默丟棄，否則席次總數會對不上', () => {
    const unknown = parseElcand('10,005,01,000,0000,1,戊,777,1,0500101,60,臺灣省,大學,N,*, ');
    expect(seatBreakdown(unknown, parties))
      .toEqual([{ partyCode: '777', partyName: '未知政黨（代號 777）', seats: 1 }]);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `pnpm exec vitest run test/electionRules.test.ts`
Expected: FAIL，找不到模組 `../scraper/lib/electionRules`。

- [ ] **Step 3: 寫最小實作**

建立 `scraper/lib/electionRules.ts`：

```ts
// 選舉規則的判定。純函式，無 I/O。
import { INDEPENDENT_PARTY_CODE, countyCodeOf, type Candidate } from './cecVoteData';

export interface TermRecord {
  year: number;
  countyCode: string;
  name: string;
  birthDate: string;
}

export interface TermLimitResult {
  limited: boolean;
  reason: string;
}

/** 地方公職人員選舉為四年一屆。 */
const TERM_YEARS = 4;

/** 把某年的當選者轉成任期紀錄。區代碼一律上溯到縣市——連任限制綁在縣市而非選區。 */
export function toTermRecords(year: number, winners: Candidate[]): TermRecord[] {
  return winners.map((w) => ({
    year,
    countyCode: countyCodeOf(w.areaCode),
    name: w.name,
    birthDate: w.birthDate,
  }));
}

/**
 * 縣市長是否已連任一次而不得再選（地方制度法第 55、56 條「連選得連任一次」）。
 *
 * 「同一人」不可只靠姓名：中選會資料同名者眾，把兩個同名的人合併計算，會誤判某人
 * 不能參選。以**姓名＋出生日期**認定，兩者皆同才算同一人。
 *
 * 「連任」須是連續兩屆。中間隔屆（2014 當選、2018 落選、2022 當選）不受限。
 *
 * 改制升格（如 2010 年縣市合併改制直轄市）不併入計算：改制後為新設地方自治團體，
 * 任期重新起算。此情形在 2018→2022 區間未發生，故此處不特別處理；日後若需處理，
 * 須以縣市代碼變動為判準，不可預設「合併計算」。
 */
export function termLimited(
  person: { name: string; birthDate: string },
  history: TermRecord[],
  countyCode: string,
  upcomingYear: number,
): TermLimitResult {
  const years = new Set(history
    .filter((h) => h.name === person.name
      && h.birthDate === person.birthDate
      && h.countyCode === countyCode)
    .map((h) => h.year));
  const prev = upcomingYear - TERM_YEARS;
  const before = prev - TERM_YEARS;
  if (years.has(prev) && years.has(before)) {
    return { limited: true, reason: `已連任一次（${before}、${prev} 當選），依地方制度法不得再選` };
  }
  return { limited: false, reason: '' };
}

export interface SeatCount {
  partyCode: string;
  partyName: string;
  seats: number;
}

/**
 * 政黨席次統計，由多到少排序；席次相同時無黨籍排在具名政黨之後。
 *
 * 無黨籍照實計入：村里長與鄉鎮市民代表多數為無黨籍，把它併入「其他」或略去，
 * 會讓那幾層的政黨版圖看起來完全不是實情。
 * 代碼表查無的政黨也不丟棄——寧可顯示代號，也不要讓席次總數對不上。
 */
export function seatBreakdown(winners: Candidate[], parties: Map<string, string>): SeatCount[] {
  const n = new Map<string, number>();
  for (const w of winners) n.set(w.partyCode, (n.get(w.partyCode) ?? 0) + 1);
  return [...n.entries()]
    .map(([partyCode, seats]) => ({
      partyCode,
      partyName: parties.get(partyCode) ?? `未知政黨（代號 ${partyCode}）`,
      seats,
    }))
    .sort((a, b) => b.seats - a.seats
      || Number(a.partyCode === INDEPENDENT_PARTY_CODE) - Number(b.partyCode === INDEPENDENT_PARTY_CODE)
      || a.partyCode.localeCompare(b.partyCode));
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `pnpm exec vitest run test/electionRules.test.ts`
Expected: PASS，10 個測試全過。

- [ ] **Step 5: 加真實資料的連任限制測試**

在 `test/electionRules.test.ts` 追加：

```ts
import { readFileSync } from 'node:fs';
import { winnersByArea } from '../scraper/lib/cecVoteData';

describe('termLimited：對 2018 與 2022 真實資料', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  const R22 = 'scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉';
  const R18 = 'scraper/out-roster/cec/voteData/2018-107年地方公職人員選舉';

  const w22 = [...winnersByArea(['city', 'prv'].flatMap(
    (s) => parseElcand(read(`${R22}/C1/${s}/elcand.csv`)))).values()].flat();
  const w18 = [...winnersByArea(['直轄市市長', '縣市市長'].flatMap(
    (d) => parseElcand(read(`${R18}/${d}/elcand.csv`)))).values()].flat();
  const history = [...toTermRecords(2018, w18), ...toTermRecords(2022, w22)];

  it('2022 當選的 21 位縣市長都判得出結果', () => {
    const results = w22.map((w) => termLimited(w, history, countyCodeOf(w.areaCode), 2026));
    expect(results.length).toBe(21);
    expect(results.every((r) => typeof r.limited === 'boolean')).toBe(true);
  });

  it('受連任限制者為少數而非全部或零——兩種極端都代表判斷條件寫錯', () => {
    const limited = w22.filter((w) => termLimited(w, history, countyCodeOf(w.areaCode), 2026).limited);
    expect(limited.length).toBeGreaterThan(0);
    expect(limited.length).toBeLessThan(21);
  });
});
```

同時把檔首 import 補上 `countyCodeOf`：

```ts
import { parseElcand, parseElpaty, winnersByArea, countyCodeOf } from '../scraper/lib/cecVoteData';
```

- [ ] **Step 6: 執行測試確認通過**

Run: `pnpm exec vitest run test/electionRules.test.ts`
Expected: PASS，12 個測試全過。

把受限者名單印出來人工看一眼是否合理：

```bash
pnpm exec tsx -e "
import { readFileSync } from 'node:fs';
import { parseElcand, winnersByArea, countyCodeOf, parseElbase } from './scraper/lib/cecVoteData';
import { toTermRecords, termLimited } from './scraper/lib/electionRules';
const R22='scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉';
const R18='scraper/out-roster/cec/voteData/2018-107年地方公職人員選舉';
const read=(p:string)=>readFileSync(p,'utf8');
const w22=[...winnersByArea(['city','prv'].flatMap(s=>parseElcand(read(\`\${R22}/C1/\${s}/elcand.csv\`)))).values()].flat();
const w18=[...winnersByArea(['直轄市市長','縣市市長'].flatMap(d=>parseElcand(read(\`\${R18}/\${d}/elcand.csv\`)))).values()].flat();
const hist=[...toTermRecords(2018,w18),...toTermRecords(2022,w22)];
const names=new Map(parseElbase(read(\`\${R22}/V1/elbase.csv\`)).map(a=>[a.code,a.name]));
for(const w of w22){const r=termLimited(w,hist,countyCodeOf(w.areaCode),2026);
  console.log(names.get(countyCodeOf(w.areaCode)), w.name, r.limited?'不得再選':'可再選');}
"
```

- [ ] **Step 7: 提交**

```bash
git add scraper/lib/electionRules.ts test/electionRules.test.ts
git commit -m "feat(elections): 連任限制與政黨席次統計

Claude-Session: https://claude.ai/code/session_01FNzhZHTnhsCyQMi17u9vZ9"
```

---

### Task 5: 補選與重行選舉的當選者

「現況」不等於「2022 當選名單」：嘉義市長因候選人於投票前過世而延後重行選舉，另有四場議員缺額補選。不套用這些修正，嘉義市在地圖上會是空白，四個議員選區會顯示已離職者。

**這批資料的格式與主選舉完全不同**，不可沿用 `parseElcand`：

- 檔名是 `cand.csv`／`prof.csv`（非 `elcand.csv`），有 **UTF-8 BOM**，有**標頭列**
- 政黨欄是**名稱**（「中國國民黨」「無」）而非代號
- **沒有當選註記**——當選者須由 `prof.csv` 的各投開票所分號次得票加總後取最高票
- 沒有行政區代碼——選區須由目錄名解析

**Files:**
- Create: `scraper/lib/cecByElection.ts`
- Test: `test/cecByElection.test.ts`

**Interfaces:**
- Consumes: 無（獨立於前述模組）
- Produces:
  ```ts
  export interface ByElectionWinner {
    name: string;
    partyName: string;   // 原檔為名稱；「無」代表無黨籍
    votes: number;
    totalVotes: number;
  }
  export function parseByElection(candCsv: string, profCsv: string): ByElectionWinner | null;
  export interface ByElectionTarget { countyName: string; districtNo: number | null; office: 'countyChief' | 'councilSeat' }
  export function parseByElectionDir(dirName: string): ByElectionTarget | null;
  ```

- [ ] **Step 1: 寫失敗測試**

建立 `test/cecByElection.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseByElection, parseByElectionDir } from '../scraper/lib/cecByElection';

const CEC = 'scraper/out-roster/cec';

describe('parseByElection：由分號次得票推出當選者', () => {
  const cand = [
    '﻿號次,名字,政黨名稱',
    '1,甲,中國國民黨',
    '2,乙,無',
  ].join('\n');
  const prof = [
    '﻿行政區別,村里別,投開票所別,號次1,號次2,有效票數A,無效票數B',
    '東區,短竹里,1,100,50,150,0',
    '東區,蘭潭里,2,30,90,120,0',
  ].join('\n');

  it('跨投開票所加總後取最高票——單一票所的領先不代表當選', () => {
    expect(parseByElection(cand, prof)).toEqual({ name: '乙', partyName: '無', votes: 140, totalVotes: 270 });
  });

  it('BOM 不可留在第一個欄位名裡，否則標頭對不到', () => {
    expect(parseByElection(cand, prof)?.name).toBe('乙');
  });

  it('資料不全時回 null，不硬猜當選者', () => {
    expect(parseByElection('', '')).toBeNull();
  });
});

describe('parseByElectionDir：由目錄名解析選區', () => {
  it('嘉義市長重行選舉', () => {
    expect(parseByElectionDir('2022年_嘉義市長重行選舉'))
      .toEqual({ countyName: '嘉義市', districtNo: null, office: 'countyChief' });
  });
  it('議員缺額補選帶選舉區號', () => {
    expect(parseByElectionDir('2024宜蘭縣議會第20屆議員第4選舉區缺額補選'))
      .toEqual({ countyName: '宜蘭縣', districtNo: 4, office: 'councilSeat' });
    expect(parseByElectionDir('2024臺中市議會第4屆議員第15選舉區缺額補選'))
      .toEqual({ countyName: '臺中市', districtNo: 15, office: 'councilSeat' });
  });
  it('認不出的目錄名回 null，由呼叫端列報而非默默略過', () => {
    expect(parseByElectionDir('某某其他選舉')).toBeNull();
  });
});

describe('parseByElection：對真實資料', () => {
  const load = (dir: string) => parseByElection(
    readFileSync(`${CEC}/${dir}/cand.csv`, 'utf8'),
    readFileSync(`${CEC}/${dir}/prof.csv`, 'utf8'));

  it('嘉義市長重行選舉由黃敏惠當選', () => {
    expect(load('2022年_嘉義市長重行選舉')?.name).toBe('黃敏惠');
  });

  it('四場議員缺額補選的當選者', () => {
    const base = '鄉鎮市長及議員補選(2023年後)';
    expect(load(`${base}/2024宜蘭縣議會第20屆議員第4選舉區缺額補選`)?.name).toBe('黃雯如');
    expect(load(`${base}/2024新竹縣議會第20屆議員第7選舉區缺額補選`)?.name).toBe('陳星宏');
    expect(load(`${base}/2024臺中市議會第4屆議員第15選舉區缺額補選`)?.name).toBe('吳建德');
    expect(load(`${base}/2024臺東縣議會第20屆議員第16選舉區缺額補選`)?.name).toBe('董昌華');
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `pnpm exec vitest run test/cecByElection.test.ts`
Expected: FAIL，找不到模組 `../scraper/lib/cecByElection`。

- [ ] **Step 3: 寫最小實作**

建立 `scraper/lib/cecByElection.ts`：

```ts
// 補選與重行選舉的當選者推導。純字串處理，無 I/O。
//
// 這批資料的格式與主選舉（elcand.csv）完全不同：有 BOM、有標頭列、政黨欄是名稱而非
// 代號，而且**沒有當選註記**。當選者只能由 prof.csv 的各投開票所分號次得票加總後取
// 最高票——單一票所的領先不代表當選，必須跨所加總。

export interface ByElectionWinner {
  name: string;
  partyName: string;
  votes: number;
  totalVotes: number;
}

/** 去掉 UTF-8 BOM。留著會讓第一個欄位名變成「﻿號次」而對不到標頭。 */
const stripBom = (s: string): string => s.replace(/^﻿/, '');

function rows(csv: string): string[][] {
  return stripBom(csv ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(','));
}

export function parseByElection(candCsv: string, profCsv: string): ByElectionWinner | null {
  const cr = rows(candCsv);
  const pr = rows(profCsv);
  if (cr.length < 2 || pr.length < 2) return null;

  // 候選人：號次 → 姓名、政黨名稱
  const cands = new Map<string, { name: string; partyName: string }>();
  for (const r of cr.slice(1)) {
    if (r.length < 3 || !r[0].trim()) continue;
    cands.set(r[0].trim(), { name: r[1].trim(), partyName: r[2].trim() });
  }
  if (!cands.size) return null;

  // 得票：標頭中「號次N」欄的位置
  const head = pr[0].map((h) => h.trim());
  const cols = new Map<string, number>();
  for (const [no] of cands) {
    const i = head.indexOf(`號次${no}`);
    if (i >= 0) cols.set(no, i);
  }
  if (!cols.size) return null;

  const total = new Map<string, number>();
  for (const r of pr.slice(1)) {
    for (const [no, i] of cols) {
      const v = Number((r[i] ?? '0').replace(/,/g, '').trim() || '0');
      total.set(no, (total.get(no) ?? 0) + (Number.isFinite(v) ? v : 0));
    }
  }

  const sum = [...total.values()].reduce((a, b) => a + b, 0);
  if (sum === 0) return null;
  const [winNo, votes] = [...total.entries()].sort((a, b) => b[1] - a[1])[0];
  const c = cands.get(winNo)!;
  return { name: c.name, partyName: c.partyName, votes, totalVotes: sum };
}

export interface ByElectionTarget {
  countyName: string;
  districtNo: number | null;
  office: 'countyChief' | 'councilSeat';
}

/**
 * 由目錄名解析選區。這批資料沒有行政區代碼，目錄名是唯一線索。
 * 認不出的回 null——由呼叫端列報，不可默默略過，否則新增的補選會被無聲吃掉。
 */
export function parseByElectionDir(dirName: string): ByElectionTarget | null {
  const county = dirName.match(/([一-鿿]{2,3}[縣市])/)?.[1];
  if (!county) return null;
  if (/市長|縣長/.test(dirName)) return { countyName: county, districtNo: null, office: 'countyChief' };
  const no = dirName.match(/第\s*(\d+)\s*選舉區/)?.[1];
  if (/議員/.test(dirName) && no) {
    return { countyName: county, districtNo: Number(no), office: 'councilSeat' };
  }
  return null;
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `pnpm exec vitest run test/cecByElection.test.ts`
Expected: PASS，8 個測試全過。

- [ ] **Step 5: 提交**

```bash
git add scraper/lib/cecByElection.ts test/cecByElection.test.ts
git commit -m "feat(elections): 補選與重行選舉的當選者推導

Claude-Session: https://claude.ai/code/session_01FNzhZHTnhsCyQMi17u9vZ9"
```

---

### Task 6: 行政區名稱正規化與複合鍵

**Files:**
- Create: `scraper/lib/areaMatch.ts`
- Test: `test/areaMatch.test.ts`

**Interfaces:**
- Consumes: `AreaNode`（Task 1）
- Produces:
  ```ts
  export function normalizeAreaName(name: string): string;
  export function areaKey(county: string, town?: string, village?: string): string;
  export function buildKeyIndex(areas: AreaNode[]): Map<string, string>;   // 名稱鍵 → 代碼
  export function buildCodeIndex(areas: AreaNode[]): Map<string, string>;  // 代碼 → 名稱鍵
  ```

- [ ] **Step 1: 寫失敗測試**

建立 `test/areaMatch.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeAreaName, areaKey, buildKeyIndex, buildCodeIndex } from '../scraper/lib/areaMatch';
import { parseElbase } from '../scraper/lib/cecVoteData';

const V1_ELBASE = 'scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉/V1/elbase.csv';

describe('normalizeAreaName', () => {
  it('台一律正規化為臺——兩種寫法在官方檔案裡都出現', () => {
    expect(normalizeAreaName('台北市')).toBe('臺北市');
    expect(normalizeAreaName('臺北市')).toBe('臺北市');
  });
  it('去除空白', () => {
    expect(normalizeAreaName(' 松山 區 ')).toBe('松山區');
  });
  it('全形數字轉半形', () => {
    expect(normalizeAreaName('中山１里')).toBe('中山1里');
  });
  it('空值不拋錯', () => {
    expect(normalizeAreaName('')).toBe('');
  });
});

describe('areaKey：複合鍵', () => {
  it('三段以斜線相連', () => {
    expect(areaKey('臺北市', '松山區', '莊敬里')).toBe('臺北市/松山區/莊敬里');
  });
  it('省略下層即為該層的鍵', () => {
    expect(areaKey('臺北市', '松山區')).toBe('臺北市/松山區');
    expect(areaKey('臺北市')).toBe('臺北市');
  });
  it('組鍵時一併正規化，呼叫端不必先處理', () => {
    expect(areaKey('台北市', '松山區', '莊敬里')).toBe('臺北市/松山區/莊敬里');
  });
});

describe('buildKeyIndex：對真實資料', () => {
  const areas = parseElbase(readFileSync(V1_ELBASE, 'utf8'));

  it('全國每個行政區的複合鍵唯一——鍵若碰撞會把某村的村里長掛到另一村頭上', () => {
    expect(buildKeyIndex(areas).size).toBe(areas.length);
  });

  it('單以村里名不唯一，故複合鍵必須含上層', () => {
    const villages = areas.filter((a) => a.level === 'village');
    expect(new Set(villages.map((v) => v.name)).size).toBeLessThan(villages.length);
  });

  it('可用鍵反查代碼，也可用代碼反查鍵', () => {
    expect(buildKeyIndex(areas).get('臺北市/松山區/莊敬里')).toBe('63-000-00-010-0002');
    expect(buildCodeIndex(areas).get('63-000-00-010-0002')).toBe('臺北市/松山區/莊敬里');
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `pnpm exec vitest run test/areaMatch.test.ts`
Expected: FAIL，找不到模組 `../scraper/lib/areaMatch`。

- [ ] **Step 3: 寫最小實作**

建立 `scraper/lib/areaMatch.ts`：

```ts
// 行政區名稱的正規化與對應。純函式，無 I/O。
//
// 中選會用自己的五段代碼，內政部界線檔用行政區代碼，兩套不通用。唯一可靠的橋是名稱，
// 但單以村里名不唯一（「中山里」全台數十個），故以「縣市／鄉鎮市區／村里」複合鍵對應。
import type { AreaNode } from './cecVoteData';

/**
 * 名稱正規化。兩份官方檔案的用字不完全一致：
 *   「台」與「臺」兩種寫法都出現（中選會多用臺，部分界線檔用台）
 *   界線檔的名稱可能夾雜空白或全形數字
 * 只做這幾項確定的轉換，不做同義詞猜測——猜錯會把職務掛到別的行政區。
 */
export function normalizeAreaName(name: string): string {
  return (name ?? '')
    .replace(/[\s　]/g, '')
    .replace(/台/g, '臺')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/** 複合鍵。省略下層即為該層的鍵。 */
export function areaKey(county: string, town?: string, village?: string): string {
  return [county, town, village]
    .filter((s): s is string => s != null && s !== '')
    .map(normalizeAreaName)
    .join('/');
}

/** 由節點上溯出「縣市/鄉鎮市區/村里」的名稱路徑。 */
function namePath(a: AreaNode, byCode: Map<string, AreaNode>): string[] {
  const path = [a.name];
  let cur = a;
  while (cur.parent) {
    const p = byCode.get(cur.parent);
    if (!p) break;
    path.unshift(p.name);
    cur = p;
  }
  return path;
}

/**
 * 名稱鍵 → 中選會代碼。
 *
 * 回傳的 Map 大小應與輸入節點數相同；若小於，代表有鍵碰撞，必須查明後修正，
 * 不可放著不管——碰撞會讓兩個行政區的資料互相覆蓋。
 */
export function buildKeyIndex(areas: AreaNode[]): Map<string, string> {
  const byCode = new Map(areas.map((a) => [a.code, a]));
  const index = new Map<string, string>();
  for (const a of areas) {
    const p = namePath(a, byCode);
    index.set(areaKey(p[0], p[1], p[2]), a.code);
  }
  return index;
}

/** 中選會代碼 → 名稱鍵。與 buildKeyIndex 互為反向。 */
export function buildCodeIndex(areas: AreaNode[]): Map<string, string> {
  const byCode = new Map(areas.map((a) => [a.code, a]));
  const index = new Map<string, string>();
  for (const a of areas) {
    const p = namePath(a, byCode);
    index.set(a.code, areaKey(p[0], p[1], p[2]));
  }
  return index;
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `pnpm exec vitest run test/areaMatch.test.ts`
Expected: PASS，10 個測試全過。

若「複合鍵唯一」一測失敗，先印出碰撞的鍵與代碼查明原因，再決定是修正正規化規則還是複合鍵的組成。**不可**改成數量門檻放過。

- [ ] **Step 5: 提交**

```bash
git add scraper/lib/areaMatch.ts test/areaMatch.test.ts
git commit -m "feat(elections): 行政區名稱正規化與複合鍵索引

Claude-Session: https://claude.ai/code/session_01FNzhZHTnhsCyQMi17u9vZ9"
```

---

### Task 7: 界線檔取得與轉換

**Files:**
- Create: `scraper/fetch-boundaries.ts`
- Create: `scraper/boundaries/`（TopoJSON 產物與 `meta.json`，進版控）
- Modify: `package.json`（devDependency `mapshaper`、script `build:boundaries`）
- Test: `test/areaMatch.test.ts`（追加全量對應測試）

**Interfaces:**
- Consumes: `areaKey`、`buildCodeIndex`（Task 6）
- Produces:
  - `scraper/boundaries/{county,town,village}.topo.json`，每個 geometry 的 `properties` 含 `key`（複合鍵）與 `name`
  - `scraper/boundaries/meta.json`：`{ datasets: [{ name, version, url, license }], retrievedAt }`

> **這是本計畫唯一的外部相依。** Task 1–6 不依賴任何下載，即使本任務受阻，其成果仍然有效。

- [ ] **Step 1: 確認可取得 2022 年版界線檔**

到 政府資料開放平臺（data.gov.tw）找內政部國土測繪中心的三筆資料集：「直轄市、縣市界線」「鄉鎮市區界線」「村里界圖」。確認能取得 **2022 年（民國 111 年）版本**，格式 SHP 或 GeoJSON，授權為政府資料開放授權條款。

下載後放 `scraper/boundaries/src/`，並記錄資料集名稱、版本日期、下載網址、授權、取用日期。

**決策點**：若只找得到現行版而無 2022 年版，**停下來回報**，不要逕自使用現行版——村里界逐年變動，用錯版本會讓部分村里對不上或對錯。這個決定由專案負責人做。

- [ ] **Step 2: 安裝轉檔工具**

```bash
pnpm add -D mapshaper
```

- [ ] **Step 3: 寫轉檔腳本**

建立 `scraper/fetch-boundaries.ts`：

```ts
// 界線檔轉換：SHP／GeoJSON → 簡化後的 TopoJSON，並補上與中選會對應用的複合鍵。
//
// 產物進版控：界線檔一年才變一次，每次建置都重跑既慢又需要外部下載。
//
//   pnpm run build:boundaries
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { areaKey } from './lib/areaMatch';

const OUT = 'scraper/boundaries';
mkdirSync(OUT, { recursive: true });

// 欄位名稱依 Step 1 實際下載的檔案填寫。內政部 SHP 慣用 COUNTYNAME/TOWNNAME/VILLNAME，
// 但不同年度版本曾有差異，轉檔前先用 `pnpm exec mapshaper <檔> -info` 確認。
const LAYERS = [
  { level: 'county', src: `${OUT}/src/COUNTY_MOI.shp`, fields: ['COUNTYNAME'] },
  { level: 'town', src: `${OUT}/src/TOWN_MOI.shp`, fields: ['COUNTYNAME', 'TOWNNAME'] },
  { level: 'village', src: `${OUT}/src/VILLAGE_MOI.shp`, fields: ['COUNTYNAME', 'TOWNNAME', 'VILLNAME'] },
] as const;

for (const layer of LAYERS) {
  const tmp = `${OUT}/${layer.level}.raw.json`;
  // keep-shapes：保證再小的離島也不會在簡化中消失。消失的島等於地圖上少一塊可點擊的行政區。
  execFileSync('pnpm', ['exec', 'mapshaper', layer.src,
    '-simplify', '10%', 'keep-shapes',
    '-o', 'format=topojson', tmp], { stdio: 'inherit' });

  const topo = JSON.parse(readFileSync(tmp, 'utf8'));
  for (const obj of Object.values(topo.objects) as any[]) {
    for (const geo of obj.geometries) {
      const p = geo.properties ?? {};
      const parts = layer.fields.map((f) => String(p[f] ?? ''));
      geo.properties = {
        key: areaKey(parts[0], parts[1], parts[2]),
        name: parts[parts.length - 1],
      };
    }
  }
  writeFileSync(`${OUT}/${layer.level}.topo.json`, JSON.stringify(topo));
  const n = (Object.values(topo.objects) as any[]).reduce((s, o) => s + o.geometries.length, 0);
  console.log(`${layer.level}：${n} 個多邊形`);
}
```

另建 `scraper/boundaries/meta.json`，內容依 Step 1 記錄填寫：

```json
{
  "datasets": [
    { "name": "直轄市、縣市界線", "version": "", "url": "", "license": "政府資料開放授權條款" },
    { "name": "鄉鎮市區界線", "version": "", "url": "", "license": "政府資料開放授權條款" },
    { "name": "村里界圖", "version": "", "url": "", "license": "政府資料開放授權條款" }
  ],
  "retrievedAt": ""
}
```

`package.json` 的 `scripts` 加入：

```json
"build:boundaries": "tsx scraper/fetch-boundaries.ts"
```

- [ ] **Step 4: 執行轉檔**

Run: `pnpm run build:boundaries`
Expected: 印出三層的多邊形數，county 為 22、town 為 368、village 接近 7,756。

- [ ] **Step 5: 寫全量對應測試**

在 `test/areaMatch.test.ts` 追加：

```ts
describe('界線檔與中選會行政區的全量對應', () => {
  const areas = parseElbase(readFileSync(V1_ELBASE, 'utf8'));
  const codeIndex = buildCodeIndex(areas);

  // 已知例外：界線檔確實沒有的行政區，逐筆列名並附理由。
  // 不可改成「比例低於 X% 就通過」——那會讓新出現的對應失敗被沉默吃掉。
  const KNOWN_MISSING: string[] = [];

  for (const level of ['county', 'town', 'village'] as const) {
    it(`${level} 層的每個中選會行政區都對得到界線`, () => {
      const topo = JSON.parse(readFileSync(`scraper/boundaries/${level}.topo.json`, 'utf8'));
      const keys = new Set<string>((Object.values(topo.objects) as any[])
        .flatMap((o) => o.geometries.map((g: any) => g.properties.key)));
      const missing = areas
        .filter((a) => a.level === level)
        .map((a) => codeIndex.get(a.code) ?? a.code)
        .filter((k) => !keys.has(k) && !KNOWN_MISSING.includes(k));
      expect(missing).toEqual([]);
    });
  }
});
```

- [ ] **Step 6: 執行測試**

Run: `pnpm exec vitest run test/areaMatch.test.ts`
Expected: PASS，13 個測試全過。

若有對不上的行政區，逐筆查明：名稱寫法差異（→ 補正規化規則）、界線檔缺漏（→ 加入 `KNOWN_MISSING` 並註明理由）、或 2022 年之後的行政區調整（→ 代表下載到錯的年度版本，回 Step 1）。**不可**為了讓測試通過而放寬判準。

- [ ] **Step 7: 提交**

```bash
git add scraper/fetch-boundaries.ts scraper/boundaries test/areaMatch.test.ts package.json pnpm-lock.yaml
git commit -m "feat(elections): 行政區界線檔轉換與全量對應測試

Claude-Session: https://claude.ai/code/session_01FNzhZHTnhsCyQMi17u9vZ9"
```

---

### Task 8: 分層地圖資料產出

**Files:**
- Create: `src/lib/mapTypes.ts`
- Create: `scraper/build-election-map.ts`
- Create: `public/data/map/`（產物，進版控）
- Modify: `package.json`（script `build:election-map`）

**Interfaces:**
- Consumes: Task 1–7 的全部匯出（含 Task 5 的補選推導）
- Produces:
  ```ts
  // src/lib/mapTypes.ts
  export interface PartySeat { partyCode: string; partyName: string; seats: number }
  export interface Officeholder {
    name: string; partyCode: string; partyName: string;
    slug: string | null;          // 站上檔案頁的 slug；無背景資料者為 null
    termLimited?: boolean; termLimitReason?: string;   // 僅縣市長有
  }
  export interface MapArea {
    code: string; key: string; name: string;
    chief: Officeholder | null;   // 首長／鄉鎮市長／村里長
    seats: PartySeat[];           // 議會／代表會席次；村里層為空陣列
    childFile: string | null;     // 下一層的檔名；村里層為 null
  }
  export interface MapLayer {
    level: 'national' | 'county' | 'town';
    parentName: string;
    topology: unknown;            // TopoJSON，objects.areas，properties.key 對應 MapArea.key
    areas: MapArea[];
  }
  ```

- [ ] **Step 1: 建立共用型別**

建立 `src/lib/mapTypes.ts`，內容即上方 Interfaces 區塊的型別定義，並在檔首加註解：

```ts
// 地圖分層資料的型別。scraper 產出、前端讀取，兩邊共用同一份定義，
// 避免產出端改了欄位而前端渾然不覺。
```

- [ ] **Step 2: 寫產出腳本**

建立 `scraper/build-election-map.ts`：

```ts
// 合併中選會選舉結果與行政區界線，輸出分層地圖資料。
//
// 為什麼分層：全國 7,756 個村里若一次送給瀏覽器，檔案數十 MB。改成點到哪載到哪，
// 單一畫面的多邊形數是全國 22、縣市層 5–39、鄉鎮市區層平均 21。
//
// 為什麼輸出到 public/ 而非 src/：這些檔案要在執行期被 fetch。src/ 底下的檔案只在
// 建置期可用，放錯會 404。站上既有的 public/data/donors.json 即此慣例。
//
//   pnpm run build:election-map
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';
import {
  parseElbase, parseElcand, parseElpaty, winnersByArea, countyCodeOf, townCodeOf,
  INDEPENDENT_PARTY_CODE, type Candidate, type AreaNode,
} from './lib/cecVoteData';
import { parseByElection, parseByElectionDir } from './lib/cecByElection';
import { buildCodeIndex } from './lib/areaMatch';
import { seatBreakdown, toTermRecords, termLimited } from './lib/electionRules';
import type { MapArea, MapLayer, Officeholder } from '../src/lib/mapTypes';

const CEC = 'scraper/out-roster/cec';
const R22 = `${CEC}/voteData/2022-111年地方公職人員選舉`;
const R18 = `${CEC}/voteData/2018-107年地方公職人員選舉`;
const OUT = 'public/data/map';
const UPCOMING = 2026;

const read = (p: string) => readFileSync(p, 'utf8');

// 2022 的類別代碼。C1/T1/T2/T3 之下再分 city/ 與 prv/，其餘直接在類別目錄下。
const CAT_2022 = [
  { code: 'C1', office: 'countyChief', subs: ['city', 'prv'] },
  { code: 'T1', office: 'councilSeat', subs: ['city', 'prv'] },
  { code: 'T2', office: 'councilSeat', subs: ['city', 'prv'] },
  { code: 'T3', office: 'councilSeat', subs: ['city', 'prv'] },
  { code: 'D1', office: 'townChief', subs: [''] },
  { code: 'D2', office: 'townChief', subs: [''] },
  { code: 'R1', office: 'townRepSeat', subs: [''] },
  { code: 'R2', office: 'townRepSeat', subs: [''] },
  { code: 'R3', office: 'townRepSeat', subs: [''] },
  { code: 'V1', office: 'villageChief', subs: [''] },
] as const;

type Office = typeof CAT_2022[number]['office'];

function loadWinners(): Map<Office, Candidate[]> {
  const m = new Map<Office, Candidate[]>();
  for (const c of CAT_2022) {
    const cands = c.subs.flatMap((s) => parseElcand(read([R22, c.code, s, 'elcand.csv'].filter(Boolean).join('/'))));
    const won = [...winnersByArea(cands).values()].flat();
    m.set(c.office, [...(m.get(c.office) ?? []), ...won]);
  }
  return m;
}

// 2018 只需縣市長，且目錄名是中文而非代碼（見 Global Constraints）
function load2018Chiefs(): Candidate[] {
  return ['直轄市市長', '縣市市長']
    .flatMap((d) => parseElcand(read(`${R18}/${d}/elcand.csv`)))
    .filter((c) => c.elected);
}

// 站上既有人物的 slug：用「姓名＋縣市」比對，對不到就是 null（本站尚無此人背景資料）
function loadSlugs(): Map<string, string> {
  const officials = JSON.parse(read('src/data/officials.json')) as any[];
  const m = new Map<string, string>();
  for (const o of officials) {
    if (o.officeType !== 'mayor_magistrate' && o.officeType !== 'councilor') continue;
    const county = String(o.district ?? '').match(/^(.+?[縣市])/)?.[1] ?? '';
    if (county) m.set(`${o.name}/${county}`, o.slug);
  }
  return m;
}

// 補選與重行選舉的覆蓋。「現況」不等於「2022 當選名單」：嘉義市長延後重行選舉，
// 另有四場議員缺額補選。不套用這些修正，嘉義市會是空白，四個議員選區會顯示已離職者。
function applyByElections(winners: Map<Office, Candidate[]>, areas: AreaNode[], parties: Map<string, string>): string[] {
  const notes: string[] = [];
  const countyByName = new Map(areas.filter((a) => a.level === 'county').map((a) => [a.name, a.code]));
  const partyCodeByName = new Map([...parties.entries()].map(([code, name]) => [name, code]));

  const dirs = [
    `${CEC}/2022年_嘉義市長重行選舉`,
    ...readdirSync(`${CEC}/鄉鎮市長及議員補選(2023年後)`)
      .map((d) => `${CEC}/鄉鎮市長及議員補選(2023年後)/${d}`),
  ];

  for (const dir of dirs) {
    const name = basename(dir);
    const target = parseByElectionDir(name);
    const win = parseByElection(read(`${dir}/cand.csv`), read(`${dir}/prof.csv`));
    if (!target || !win) { notes.push(`無法解析補選：${name}`); continue; }
    const countyCode = countyByName.get(target.countyName);
    if (!countyCode) { notes.push(`補選的縣市對不到行政區樹：${name}`); continue; }

    // 補選檔的政黨是名稱不是代號；「無」即無黨籍
    const partyCode = win.partyName === '無'
      ? INDEPENDENT_PARTY_CODE
      : partyCodeByName.get(win.partyName) ?? INDEPENDENT_PARTY_CODE;

    const s = countyCode.split('-');
    const areaCode = target.districtNo == null
      ? countyCode
      : [s[0], s[1], String(target.districtNo).padStart(2, '0'), '000', '0000'].join('-');

    const c: Candidate = {
      areaCode, number: 0, name: win.name, partyCode,
      sex: '1', birthDate: '', age: 0, education: '',
      incumbent: false, elected: true,
    };

    const list = winners.get(target.office) ?? [];
    if (target.office === 'countyChief') {
      // 首長為單一席次：同縣市的既有紀錄整筆換掉
      winners.set('countyChief', [...list.filter((w) => countyCodeOf(w.areaCode) !== countyCode), c]);
      notes.push(`套用重行選舉：${target.countyName}縣市長 → ${win.name}`);
    } else {
      // 議員缺額補選：只換掉該選區裡「已不在任」的那一席。原始資料無從得知是哪一位
      // 離職，故以「該選區當選人數超出應選名額」為由不做刪除，改為附加後去重同名者。
      const same = list.filter((w) => w.areaCode === areaCode && w.name === win.name);
      if (!same.length) {
        winners.set(target.office, [...list, c]);
        notes.push(`套用缺額補選：${target.countyName}第${target.districtNo}選舉區 → ${win.name}`);
      }
    }
  }
  return notes;
}

const areas = parseElbase(read(`${R22}/V1/elbase.csv`));
const byCode = new Map(areas.map((a) => [a.code, a]));
const codeIndex = buildCodeIndex(areas);
const parties = parseElpaty(read(`${R22}/V1/elpaty.csv`));
const winners = loadWinners();
for (const n of applyByElections(winners, areas, parties)) console.log(' ', n);
const slugs = loadSlugs();
const history = [
  ...toTermRecords(2018, load2018Chiefs()),
  ...toTermRecords(2022, winners.get('countyChief') ?? []),
];

const countyNameOf = (code: string) => byCode.get(countyCodeOf(code))?.name ?? '';

function holder(c: Candidate | undefined, withTermLimit: boolean): Officeholder | null {
  if (!c) return null;
  const county = countyNameOf(c.areaCode);
  const o: Officeholder = {
    name: c.name,
    partyCode: c.partyCode,
    partyName: parties.get(c.partyCode) ?? `未知政黨（代號 ${c.partyCode}）`,
    slug: slugs.get(`${c.name}/${county}`) ?? null,
  };
  if (withTermLimit) {
    const r = termLimited(c, history, countyCodeOf(c.areaCode), UPCOMING);
    o.termLimited = r.limited;
    o.termLimitReason = r.reason;
  }
  return o;
}

/** 依「上溯後的區代碼」把當選者分組。議員的選區不是行政區，須先上溯才能按縣市彙整。 */
function groupBy(cands: Candidate[], up: (code: string) => string): Map<string, Candidate[]> {
  const m = new Map<string, Candidate[]>();
  for (const c of cands) {
    const k = up(c.areaCode);
    m.set(k, [...(m.get(k) ?? []), c]);
  }
  return m;
}

const chiefByCounty = new Map((winners.get('countyChief') ?? []).map((c) => [countyCodeOf(c.areaCode), c]));
const chiefByTown = new Map((winners.get('townChief') ?? []).map((c) => [townCodeOf(c.areaCode), c]));
const chiefByVillage = new Map((winners.get('villageChief') ?? []).map((c) => [c.areaCode, c]));
const councilByCounty = groupBy(winners.get('councilSeat') ?? [], countyCodeOf);
const repByTown = groupBy(winners.get('townRepSeat') ?? [], townCodeOf);

/** 從整層 TopoJSON 抽出指定 key 集合的子集，避免每個縣市檔都挾帶全國的幾何。 */
function subsetTopology(level: 'county' | 'town' | 'village', keys: Set<string>): unknown {
  const topo = JSON.parse(read(`scraper/boundaries/${level}.topo.json`));
  const objects: Record<string, any> = {};
  for (const [name, obj] of Object.entries(topo.objects) as [string, any][]) {
    objects[name] = { ...obj, geometries: obj.geometries.filter((g: any) => keys.has(g.properties.key)) };
  }
  return { ...topo, objects };
}

function buildArea(a: AreaNode, chief: Candidate | undefined, seatWinners: Candidate[], childFile: string | null): MapArea {
  return {
    code: a.code,
    key: codeIndex.get(a.code) ?? a.code,
    name: a.name,
    chief: holder(chief, a.level === 'county'),
    seats: seatWinners.length ? seatBreakdown(seatWinners, parties) : [],
    childFile,
  };
}

mkdirSync(`${OUT}/county`, { recursive: true });
mkdirSync(`${OUT}/town`, { recursive: true });

// 全國層
const counties = areas.filter((a) => a.level === 'county');
const national: MapLayer = {
  level: 'national',
  parentName: '全國',
  topology: subsetTopology('county', new Set(counties.map((a) => codeIndex.get(a.code) ?? a.code))),
  areas: counties.map((a) => buildArea(a, chiefByCounty.get(a.code), councilByCounty.get(a.code) ?? [], `county/${a.code}.json`)),
};
writeFileSync(`${OUT}/national.json`, JSON.stringify(national));

// 縣市層：該縣市轄下的鄉鎮市區
for (const c of counties) {
  const towns = areas.filter((a) => a.level === 'town' && countyCodeOf(a.code) === c.code);
  const layer: MapLayer = {
    level: 'county',
    parentName: c.name,
    topology: subsetTopology('town', new Set(towns.map((a) => codeIndex.get(a.code) ?? a.code))),
    areas: towns.map((a) => buildArea(a, chiefByTown.get(a.code), repByTown.get(a.code) ?? [], `town/${a.code}.json`)),
  };
  writeFileSync(`${OUT}/county/${c.code}.json`, JSON.stringify(layer));
}

// 鄉鎮市區層：該鄉鎮市區轄下的村里。村里為最底層，childFile 為 null。
for (const t of areas.filter((a) => a.level === 'town')) {
  const villages = areas.filter((a) => a.level === 'village' && townCodeOf(a.code) === t.code);
  const layer: MapLayer = {
    level: 'town',
    parentName: t.name,
    topology: subsetTopology('village', new Set(villages.map((a) => codeIndex.get(a.code) ?? a.code))),
    areas: villages.map((a) => buildArea(a, chiefByVillage.get(a.code), [], null)),
  };
  writeFileSync(`${OUT}/town/${t.code}.json`, JSON.stringify(layer));
}

writeFileSync(`${OUT}/meta.json`, JSON.stringify({
  electionYear: 2022,
  electionName: '111年地方公職人員選舉',
  upcomingElection: '2026-11-28',
  boundaries: JSON.parse(read('scraper/boundaries/meta.json')),
  generatedAt: new Date().toISOString().slice(0, 10),
}, null, 2));

console.log(`輸出：全國 1 檔、縣市 ${counties.length} 檔、鄉鎮市區 ${areas.filter((a) => a.level === 'town').length} 檔`);
```

`package.json` 的 `scripts` 加入：

```json
"build:election-map": "tsx scraper/build-election-map.ts"
```

- [ ] **Step 3: 執行並驗收輸出**

Run: `pnpm run build:election-map`
Expected: 印出「輸出：全國 1 檔、縣市 22 檔、鄉鎮市區 368 檔」。

逐項驗收：

```bash
python3 -c "
import json,glob
d=json.load(open('public/data/map/national.json',encoding='utf-8'))
assert len(d['areas'])==22, len(d['areas'])
noChief=[a['name'] for a in d['areas'] if not a['chief']]
assert noChief==[], noChief   # 嘉義市須由重行選舉補上（黃敏惠），空白代表 applyByElections 沒生效
chiayi=[a for a in d['areas'] if a['name']=='嘉義市'][0]
assert chiayi['chief']['name']=='黃敏惠', chiayi['chief']
assert all(a['seats'] for a in d['areas']), '每縣市都應有議會席次'
lim=[a['name'] for a in d['areas'] if a['chief'] and a['chief'].get('termLimited')]
print('national.json ok；受連任限制:', lim)"

python3 -c "
import json,glob
n=sum(len(json.load(open(f,encoding='utf-8'))['areas']) for f in glob.glob('public/data/map/county/*.json'))
assert n==368, n; print('county 檔合計 368 個鄉鎮市區 ok')"

python3 -c "
import json,glob
n=sum(len(json.load(open(f,encoding='utf-8'))['areas']) for f in glob.glob('public/data/map/town/*.json'))
assert n==7756, n; print('town 檔合計 7756 個村里 ok')"

# 單檔大小：鄉鎮市區層的村里檔不應超過 200KB
ls -l public/data/map/town/*.json | awk '$5>204800 {print "過大:", $9, $5}' | head
```

若有檔案超過 200KB，代表 Task 7 的簡化參數不夠，回頭調整 `-simplify` 百分比後重跑兩支腳本。

- [ ] **Step 4: 提交**

```bash
git add src/lib/mapTypes.ts scraper/build-election-map.ts public/data/map package.json
git commit -m "feat(elections): 分層地圖資料產出

Claude-Session: https://claude.ai/code/session_01FNzhZHTnhsCyQMi17u9vZ9"
```

---

### Task 9: 地圖元件與頁面

**Files:**
- Create: `src/components/ElectionMap.svelte`
- Create: `src/components/ElectionSidebar.svelte`
- Create: `src/components/ElectionPanel.svelte`
- Create: `src/pages/elections.astro`
- Modify: `src/layouts/Base.astro`（導覽列）
- Modify: `src/styles/tokens.css`（政黨色）
- Modify: `package.json`（`d3-geo`、`topojson-client`）

**Interfaces:**
- Consumes: `MapLayer`、`MapArea`（Task 8）、`public/data/map/*`
- Produces: 無（終端使用者介面）

- [ ] **Step 1: 安裝依賴**

```bash
pnpm add d3-geo topojson-client
pnpm add -D @types/d3-geo @types/topojson-client
```

- [ ] **Step 2: 加政黨色 token**

在 `src/styles/tokens.css` 的 `:root` 與深色模式區塊各加一組。色碼取各黨識別色，深色模式降低彩度以維持與深底的對比：

```css
:root {
  --party-kmt: #1b9ad6;      /* 中國國民黨 */
  --party-dpp: #1b9431;      /* 民主進步黨 */
  --party-tpp: #28c8c8;      /* 台灣民眾黨 */
  --party-npp: #fbbe01;      /* 時代力量 */
  --party-pfp: #ff6310;      /* 親民黨 */
  --party-none: #9aa0a6;     /* 無黨籍 */
  --party-other: #c4a0d8;    /* 其他政黨 */
}
```

深色模式的對應區塊用同樣的變數名、較低明度的色值。**元件內不得寫死色碼**，一律讀這些變數——站上既有的 `RelationshipGraph.svelte` 即用 `getComputedStyle` 讀 token，比照辦理。

- [ ] **Step 3: 寫地圖元件**

建立 `src/components/ElectionMap.svelte`：

```svelte
<!-- 九合一政治地圖。逐層下鑽：全國 → 鄉鎮市區 → 村里。
     資料由 scraper/build-election-map.ts 產出到 public/data/map/，此處只負責繪製與互動。 -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { geoMercator, geoPath } from 'd3-geo';
  import { feature } from 'topojson-client';
  import type { MapLayer, MapArea } from '../lib/mapTypes';

  let { onSelect }: { onSelect?: (area: MapArea | null, layer: MapLayer) => void } = $props();

  // 麵包屑：堆疊已下鑽的層，回上層即 pop
  let stack = $state<{ file: string; layer: MapLayer }[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let hovered = $state<string | null>(null);
  let width = $state(720);
  let height = $state(880);

  const current = $derived(stack.at(-1)?.layer ?? null);

  // 政黨代號 → CSS 變數。查無者用 --party-other，不靜默變成無黨籍的灰。
  const PARTY_VAR: Record<string, string> = {
    '1': '--party-kmt', '16': '--party-dpp', '350': '--party-tpp',
    '267': '--party-npp', '90': '--party-pfp', '999': '--party-none',
  };
  function fillFor(area: MapArea): string {
    const code = area.chief?.partyCode;
    return `var(${code && PARTY_VAR[code] ? PARTY_VAR[code] : '--party-other'})`;
  }

  async function load(file: string) {
    loading = true;
    error = null;
    try {
      const res = await fetch(`/data/map/${file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      stack.push({ file, layer: await res.json() });
    } catch (e) {
      error = `地圖資料載入失敗（${(e as Error).message}）`;
    } finally {
      loading = false;
    }
  }

  // 幾何與投影：每層重算，讓下鑽後的範圍填滿容器
  const shapes = $derived.by(() => {
    if (!current) return [];
    const topo = current.topology as any;
    const objName = Object.keys(topo.objects)[0];
    const fc = feature(topo, topo.objects[objName]) as any;
    const proj = geoMercator().fitExtent([[8, 8], [width - 8, height - 8]], fc);
    const path = geoPath(proj);
    const byKey = new Map(current.areas.map((a) => [a.key, a]));
    return fc.features
      .map((f: any) => ({ d: path(f) ?? '', area: byKey.get(f.properties.key) }))
      .filter((s: any) => s.d && s.area);
  });

  function activate(area: MapArea) {
    onSelect?.(area, current!);
    if (area.childFile) load(area.childFile);
  }

  function back() {
    if (stack.length <= 1) return;
    stack.pop();
    onSelect?.(null, current!);
  }

  function onKey(e: KeyboardEvent, area: MapArea) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(area); }
    if (e.key === 'Escape') { e.preventDefault(); back(); }
  }

  onMount(() => { load('national.json'); });
</script>

<div class="map-wrap">
  <nav class="crumbs" aria-label="地圖層級">
    {#each stack as s, i}
      <button type="button" disabled={i === stack.length - 1}
        onclick={() => { stack = stack.slice(0, i + 1); onSelect?.(null, stack[i].layer); }}>
        {s.layer.parentName}
      </button>
      {#if i < stack.length - 1}<span aria-hidden="true">›</span>{/if}
    {/each}
  </nav>

  {#if error}
    <p class="err" role="alert">{error}
      <button type="button" onclick={() => { const f = stack.at(-1)?.file ?? 'national.json'; stack.pop(); load(f); }}>重試</button>
    </p>
  {:else if loading && !current}
    <p class="loading">載入中…</p>
  {:else if current}
    <svg viewBox="0 0 {width} {height}" role="group" aria-label="{current.parentName}政治地圖">
      {#each shapes as s (s.area.code)}
        <path d={s.d} fill={fillFor(s.area)}
          class:hovered={hovered === s.area.code}
          class:clickable={!!s.area.childFile}
          tabindex="0" role="button"
          aria-label="{s.area.name}，{s.area.chief ? `${s.area.chief.name}，${s.area.chief.partyName}` : '無資料'}"
          onclick={() => activate(s.area)}
          onkeydown={(e) => onKey(e, s.area)}
          onmouseenter={() => { hovered = s.area.code; onSelect?.(s.area, current); }}
          onmouseleave={() => { hovered = null; }} />
      {/each}
    </svg>
  {/if}
</div>

<style>
  .map-wrap { position: relative; }
  svg { width: 100%; height: auto; display: block; }
  path { stroke: var(--bg); stroke-width: 0.5; transition: opacity .12s; }
  path.clickable { cursor: pointer; }
  path.hovered, path:focus-visible { opacity: .78; stroke: var(--fg); stroke-width: 1.5; outline: none; }
  .crumbs { display: flex; gap: .4rem; align-items: center; margin-bottom: .6rem; flex-wrap: wrap; }
  .crumbs button { background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; font: inherit; }
  .crumbs button:disabled { color: var(--muted); cursor: default; }
  .err { color: var(--fg); }
</style>
```

**離島處理**：台灣本島與金門、馬祖跨距很大（連江縣在北緯 26 度、經度 119.9，與本島相距約 200 公里），`fitExtent` 全部一起算會讓本島縮成一小塊。全國層須把離島以插圖（inset）另置角落。

把上面 `shapes` 的 `$derived.by` 改成下列版本——依縣市代碼把幾何分成本島與離島兩組，各自 `fitExtent` 到不同矩形，離島組再加外框與標籤：

```ts
  // 金門（09-020）、連江（09-007）距本島太遠，與本島同一投影會把本島壓成一小塊。
  // 澎湖（10-016）雖也在海上，但距離尚可，仍與本島同框。
  const OFFSHORE = new Set(['09-020-00-000-0000', '09-007-00-000-0000']);
  const isOffshore = (code: string) => OFFSHORE.has(code);

  interface Shape { d: string; area: MapArea }
  interface Inset { label: string; shapes: Shape[]; box: [number, number, number, number] }

  const rendered = $derived.by((): { main: Shape[]; insets: Inset[] } => {
    if (!current) return { main: [], insets: [] };
    const topo = current.topology as any;
    const objName = Object.keys(topo.objects)[0];
    const fc = feature(topo, topo.objects[objName]) as any;
    const byKey = new Map(current.areas.map((a) => [a.key, a]));

    const paired = fc.features
      .map((f: any) => ({ f, area: byKey.get(f.properties.key) }))
      .filter((p: any) => p.area);

    // 只有全國層需要拆插圖：下鑽之後同一縣市內的距離不會有這種量級差異
    const split = current.level === 'national';
    const mainFeats = paired.filter((p: any) => !split || !isOffshore(p.area.code));
    const offFeats = paired.filter((p: any) => split && isOffshore(p.area.code));

    const draw = (items: any[], extent: [[number, number], [number, number]]): Shape[] => {
      if (!items.length) return [];
      const collection = { type: 'FeatureCollection', features: items.map((p) => p.f) };
      const path = geoPath(geoMercator().fitExtent(extent, collection as any));
      return items
        .map((p) => ({ d: path(p.f) ?? '', area: p.area as MapArea }))
        .filter((s) => s.d);
    };

    const main = draw(mainFeats, [[8, 8], [width * 0.72, height - 8]]);
    const insets: Inset[] = [];
    if (offFeats.length) {
      const box: [number, number, number, number] = [width * 0.76, 24, width * 0.22, height * 0.28];
      insets.push({
        label: '金門、馬祖',
        box,
        shapes: draw(offFeats, [[box[0] + 6, box[1] + 6], [box[0] + box[2] - 6, box[1] + box[3] - 6]]),
      });
    }
    return { main, insets };
  });
```

樣板的 `{#each shapes …}` 相應改為兩段——先畫 `rendered.main`，再畫每個 inset 的外框、標籤與 `shapes`：

```svelte
      {#each rendered.main as s (s.area.code)}
        <!-- 屬性與事件同前 -->
      {/each}
      {#each rendered.insets as ins}
        <rect x={ins.box[0]} y={ins.box[1]} width={ins.box[2]} height={ins.box[3]}
              fill="none" stroke="var(--line-strong)" stroke-width="1" rx="4" />
        <text x={ins.box[0] + 6} y={ins.box[1] - 6} class="inset-label">{ins.label}</text>
        {#each ins.shapes as s (s.area.code)}
          <!-- 屬性與事件同前 -->
        {/each}
      {/each}
```

`<style>` 加入：

```css
  .inset-label { font-size: 12px; fill: var(--muted); font-family: var(--sans); }
```

- [ ] **Step 4: 寫頁面**

建立 `src/pages/elections.astro`：

```astro
---
import Base from "../layouts/Base.astro";
import ElectionMap from "../components/ElectionMap.svelte";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const meta = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "map", "meta.json"), "utf8"));
const ELECTION_DAY = new Date("2026-11-28T00:00:00+08:00");
const days = Math.ceil((ELECTION_DAY.getTime() - Date.now()) / 86400000);
---

<Base title="選舉地圖｜政治人物背景資料庫"
      description="2026 年九合一選舉。以行政區地圖呈現各級公職現任者的政黨版圖，可逐層下鑽至村里。">
  <main id="main" class="wrap">
    <h1>2026 九合一選舉</h1>
    <p class="countdown">投票日 2026 年 11 月 28 日{days > 0 ? `，尚餘 ${days} 天` : ""}</p>

    <p class="notice">
      以下為 <strong>{meta.electionYear} 年{meta.electionName}</strong>的結果與其後補選之現況，
      <strong>非 2026 年選情</strong>。候選人名單須待中選會於登記期後公告，屆時另行補上。
    </p>

    <ElectionMap client:load />

    <p class="credit">
      行政區界線：內政部國土測繪中心（政府資料開放授權條款）｜選舉結果：中央選舉委員會
    </p>
  </main>
</Base>
```

側欄統計以 `onSelect` 回呼驅動；本步驟先讓地圖本身可用，側欄在 Step 6 補上。

在 `src/layouts/Base.astro` 的 `<nav class="nav">` 內，於「關係圖」與「關於」之間插入：

```html
<a href="/elections">選舉</a>
```

- [ ] **Step 5: 建置並目視驗證地圖**

```bash
pnpm run build && pnpm run preview
```

開 `http://localhost:4321/elections/` 逐項確認：

- [ ] 全國圖顯示 22 個縣市，離島看得見且本島沒有被壓縮成一小塊
- [ ] 點桃園市 → 下鑽到其 13 個鄉鎮市區
- [ ] 點中壢區 → 下鑽到其村里
- [ ] 麵包屑可逐層回上一層
- [ ] Tab 可走訪各行政區，Enter 可下鑽，Escape 可返回
- [ ] 深色模式下政黨色與背景對比足夠
- [ ] 村里層大面積為無黨籍的中性灰（這是事實，不是錯誤）
- [ ] 資料年度標示清楚可見

離島比例若不理想，回 Step 3 實作 inset 後重測。

- [ ] **Step 6: 補上側欄統計**

建立 `src/components/ElectionSidebar.svelte`：

```svelte
<!-- 地圖側欄。顯示當前選取的行政區，未選取時顯示該層的彙總。
     資料深度必須看得出來：縣市長與縣市議員連得到檔案頁，鄉鎮市長以下只有中選會欄位。 -->
<script lang="ts">
  import type { MapArea, MapLayer, PartySeat } from '../lib/mapTypes';

  let { area, layer }: { area: MapArea | null; layer: MapLayer | null } = $props();

  // 未選取單一區時，把整層的首長政黨彙總成分佈
  const overview = $derived.by((): PartySeat[] => {
    if (!layer) return [];
    const n = new Map<string, { name: string; seats: number }>();
    for (const a of layer.areas) {
      if (!a.chief) continue;
      const cur = n.get(a.chief.partyCode) ?? { name: a.chief.partyName, seats: 0 };
      cur.seats++;
      n.set(a.chief.partyCode, cur);
    }
    return [...n.entries()]
      .map(([partyCode, v]) => ({ partyCode, partyName: v.name, seats: v.seats }))
      .sort((a, b) => b.seats - a.seats);
  });

  const chiefLabel = $derived(
    layer?.level === 'national' ? '縣市長'
      : layer?.level === 'county' ? '鄉鎮市區長'
        : '村里長');
  const seatLabel = $derived(layer?.level === 'national' ? '議會席次' : '代表會席次');
</script>

<aside class="side">
  {#if area}
    <h2>{area.name}</h2>

    {#if area.chief}
      <section>
        <h3>{chiefLabel}</h3>
        {#if area.chief.slug}
          <a class="person" href={`/officials/${area.chief.slug}/`}>
            {area.chief.name}<span aria-hidden="true"> →</span>
          </a>
        {:else}
          <span class="person none">{area.chief.name}</span>
          <p class="note">本站尚無此人背景資料</p>
        {/if}
        <p class="party">{area.chief.partyName}</p>
        {#if area.chief.termLimited}
          <p class="limit">{area.chief.termLimitReason}</p>
        {/if}
      </section>
    {:else}
      <p class="note">查無{chiefLabel}資料</p>
    {/if}

    {#if area.seats.length}
      <section>
        <h3>{seatLabel}（共 {area.seats.reduce((n, s) => n + s.seats, 0)} 席）</h3>
        <ul class="bars">
          {#each area.seats as s}
            <li>
              <span class="nm">{s.partyName}</span>
              <span class="bar" style={`--w:${(s.seats / area.seats[0].seats) * 100}%`}></span>
              <span class="num">{s.seats}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {:else if layer}
    <h2>{layer.parentName}</h2>
    <section>
      <h3>{chiefLabel}政黨分佈（共 {layer.areas.length} 區）</h3>
      <ul class="bars">
        {#each overview as s}
          <li>
            <span class="nm">{s.partyName}</span>
            <span class="bar" style={`--w:${(s.seats / overview[0].seats) * 100}%`}></span>
            <span class="num">{s.seats}</span>
          </li>
        {/each}
      </ul>
    </section>
    <p class="hint">點選地圖上的行政區可看細節，再點一次可往下一層。</p>
  {/if}
</aside>

<style>
  .side { font-family: var(--sans); }
  h2 { font-family: var(--serif); margin: 0 0 .6rem; }
  h3 { font-size: .85rem; color: var(--muted); margin: 1rem 0 .35rem; font-weight: 600; }
  .person { font-size: 1.2rem; font-weight: 600; color: var(--accent); text-decoration: none; }
  .person.none { color: var(--muted); }
  .party { margin: .2rem 0 0; color: var(--fg); }
  .note { color: var(--muted); font-size: .85rem; margin: .2rem 0 0; }
  .limit { color: var(--fg); background: var(--surface); padding: .35rem .5rem; border-radius: 4px; font-size: .85rem; }
  .bars { list-style: none; padding: 0; margin: 0; display: grid; gap: .3rem; }
  .bars li { display: grid; grid-template-columns: 7rem 1fr 2.5rem; align-items: center; gap: .4rem; font-size: .85rem; }
  .bar { height: .6rem; background: var(--line-strong); width: var(--w); border-radius: 2px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .hint { color: var(--muted); font-size: .85rem; }
</style>
```

在 `src/pages/elections.astro` 把地圖與側欄並排。因兩者要共享選取狀態，改為新建一個容器元件 `src/components/ElectionPanel.svelte`，內含 `ElectionMap` 與 `ElectionSidebar`，以 `$state` 保存選取：

```svelte
<script lang="ts">
  import ElectionMap from './ElectionMap.svelte';
  import ElectionSidebar from './ElectionSidebar.svelte';
  import type { MapArea, MapLayer } from '../lib/mapTypes';

  let area = $state<MapArea | null>(null);
  let layer = $state<MapLayer | null>(null);
</script>

<div class="panel">
  <ElectionMap onSelect={(a, l) => { area = a; layer = l; }} />
  <ElectionSidebar {area} {layer} />
</div>

<style>
  .panel { display: grid; grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr); gap: 1.5rem; }
  @media (max-width: 720px) { .panel { grid-template-columns: 1fr; } }
</style>
```

並把 `elections.astro` 裡的 `<ElectionMap client:load />` 換成 `<ElectionPanel client:load />`（import 同步改掉）。

- [ ] **Step 7: 再次建置驗證並關閉 preview**

```bash
pnpm run build && pnpm run preview
```

確認側欄四種層級都正確，且縣市長那格點得進檔案頁、村里長那格顯示「本站尚無此人背景資料」。

驗證完畢後關閉：

```bash
pkill -f "astro (dev|preview)" || true
lsof -ti:4321 | xargs -r kill -9 || true
```

- [ ] **Step 8: 提交**

```bash
git add src/components/ElectionMap.svelte src/components/ElectionSidebar.svelte src/components/ElectionPanel.svelte src/pages/elections.astro src/layouts/Base.astro src/styles/tokens.css package.json pnpm-lock.yaml
git commit -m "feat(elections): 選舉分頁與可下鑽政治地圖

Claude-Session: https://claude.ai/code/session_01FNzhZHTnhsCyQMi17u9vZ9"
```

---

### Task 10: 授權標示

**Files:**
- Modify: `src/pages/about.astro`

**Interfaces:**
- Consumes: Task 7 Step 1 記錄的資料集名稱、版本、授權（存於 `scraper/boundaries/meta.json`）
- Produces: 無

- [ ] **Step 1: 在「關於」頁補上界線檔來源**

在 `src/pages/about.astro` 的資料來源段落，比照既有的照片授權標示寫法，加入三筆界線資料集的名稱、版本日期、授權條款（政府資料開放授權條款）與取用日期，以及中選會投開票資料的來源說明。

地圖頁角落的標示已在 Task 9 Step 4 完成，此處不重複。

- [ ] **Step 2: 建置確認**

Run: `pnpm run build`
Expected: 建置成功。

- [ ] **Step 3: 提交**

```bash
git add src/pages/about.astro
git commit -m "docs(elections): 界線檔與選舉資料的來源授權標示

Claude-Session: https://claude.ai/code/session_01FNzhZHTnhsCyQMi17u9vZ9"
```

---

## 完成後

```bash
pnpm exec vitest run && pnpm run build
```

Expected: 測試全過、建置成功、頁數較先前增加（新增 `/elections`）。

然後以 `superpowers:finishing-a-development-branch` 收尾。
