import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseRegistrationBbox } from '../scraper/lib/candidatePdf';

const fx = (f: string) => readFileSync(`scraper/fixtures/${f}`, 'utf8');

describe('parseRegistrationBbox：直轄市長（1-1）', () => {
  const rows = parseRegistrationBbox(fx('cand2026-1-1.bbox.html'));
  it('23 列全數解析', () => expect(rows).toHaveLength(23));
  it('第一列欄位正確、日期轉成西元 ISO', () => {
    expect(rows[0]).toEqual({
      district: '臺北市', registeredOn: '2026-08-31', name: '郭璽',
      party: '台灣麻將最大黨', note: '', number: null,
    });
  });
  it('保持名冊列序', () => {
    expect(rows.filter((r) => r.district === '高雄市').map((r) => r.name))
      .toEqual(['張靜', '賴瑞隆', '王肇民', '柯志恩', '洪方隆']);
  });
});

describe('parseRegistrationBbox：縣市長（3-1，跨頁）', () => {
  const rows = parseRegistrationBbox(fx('cand2026-3-1.bbox.html'));
  it('58 列，跨頁表頭不被當成資料', () => {
    expect(rows).toHaveLength(58);
    expect(rows.some((r) => r.name.includes('姓名') || r.district.includes('選舉區'))).toBe(false);
  });
  it('二字姓名、四字姓名都完整', () => {
    expect(rows.find((r) => r.name === '張峻')?.district).toBe('花蓮縣');
    expect(rows.find((r) => r.name === '李吳穎智')?.district).toBe('臺東縣');
  });
});

describe('parseRegistrationBbox：折行儲存格', () => {
  it('長政黨名折兩行要接回', () => {
    const rows = parseRegistrationBbox(fx('cand2026-2-1-p1.bbox.html'));
    expect(rows).toHaveLength(28);
    expect(rows.some((r) => r.party === '天宙和平統一家庭黨')).toBe(true);
  });
  it('原住民姓名上下折行要接回，且不吃到鄰列', () => {
    const rows = parseRegistrationBbox(fx('cand2026-2-1-p8.bbox.html'));
    expect(rows).toHaveLength(22);
    const d12 = rows.filter((r) => r.district === '新北市第12選舉區');
    expect(d12.map((r) => [r.name, r.party])).toEqual(expect.arrayContaining([
      ['吳國譽La‧Is‧Amid', '中國國民黨'],
      ['蘇錦雄Paylang‧Caya', '民主進步黨'],
      ['楊春妹', '中國國民黨'],
      ['宋雨蓁Nikar‧Falong', '無'],
    ]));
  });
  it('高雄山地原住民選區的羅馬拼音姓名', () => {
    const rows = parseRegistrationBbox(fx('cand2026-2-1-p22.bbox.html'));
    expect(rows).toHaveLength(21);
    expect(rows.some((r) => r.district === '高雄市第14選舉區' && r.name === '高忠德Takiludun．Anu')).toBe(true);
  });
  it('政黨名在字中間折行（歐巴／桑）', () => {
    const rows = parseRegistrationBbox(fx('cand2026-4-1-p42.bbox.html'));
    expect(rows).toHaveLength(21);
    expect(rows.some((r) => r.party === '小民參政歐巴桑聯盟')).toBe(true);
  });
});

// 之後的審定／號次版 PDF 會多一個「號次」欄；用合成的 bbox 驗證欄位依表頭判定。
function synth(words: [number, number, string][]): string {
  const w = words.map(([x, y, t]) =>
    `<word xMin="${x}" yMin="${y}" xMax="${x + t.length * 12}" yMax="${y + 12}">${t}</word>`).join('\n');
  return `<doc><page width="595" height="841">\n${w}\n</page></doc>`;
}

describe('parseRegistrationBbox：號次欄', () => {
  it('表頭有「號次」時解析成數字', () => {
    const rows = parseRegistrationBbox(synth([
      [60, 80, '號次'], [110, 80, '選舉區'], [210, 80, '登記日期'], [290, 80, '姓名'], [360, 80, '推薦之政黨'], [460, 80, '備註'],
      [64, 100, '2'], [100, 100, '臺北市'], [204, 100, '115/09/02'], [285, 100, '沈伯洋'], [356, 100, '民主進步黨'],
    ]));
    expect(rows).toEqual([{
      district: '臺北市', registeredOn: '2026-09-02', name: '沈伯洋', party: '民主進步黨', note: '', number: 2,
    }]);
  });
  it('有日期卻缺姓名的列直接拋錯，不產生半殘的候選人', () => {
    expect(() => parseRegistrationBbox(synth([
      [110, 80, '選舉區'], [210, 80, '登記日期'], [290, 80, '姓名'], [360, 80, '推薦之政黨'], [460, 80, '備註'],
      [100, 100, '臺北市'], [204, 100, '115/09/02'], [356, 100, '民主進步黨'],
    ]))).toThrow(/姓名/);
  });
});

// 完整性斷言只數列數，抓不到「折行字詞歸給鄰列」；對完整名冊檢查每格形狀。
// 讀本機 gitignored 的 bbox 檔（不在測試裡呼叫 pdftotext）；檔案不在時略過。
import { existsSync } from 'node:fs';

describe('完整名冊健全性（讀本機 gitignored 名冊）', () => {
  const dir = 'scraper/out-roster/cec/2026-registration';
  for (const f of ['1-1', '2-1', '3-1', '4-1']) {
    const path = `${dir}/${f}.bbox.html`;
    it.skipIf(!existsSync(path))(`${f}：姓名、政黨、選舉區形狀正確`, () => {
      const rows = parseRegistrationBbox(readFileSync(path, 'utf8'));
      const nameRe = /^(\p{Script=Han}+([‧．・·]\p{Script=Han}+)*)?([A-Za-z][A-Za-zʼ'‧．・·\s]*)?$/u;
      const districtRe = /^.{2}[縣市](第\d+選舉區)?$/;
      expect(rows.filter((r) => !r.name || !nameRe.test(r.name))).toEqual([]);
      expect(rows.filter((r) => !r.party || /[\d/]/.test(r.party))).toEqual([]);
      expect(rows.filter((r) => !districtRe.test(r.district))).toEqual([]);
    });
  }
  // 4-1 屏東縣第11選舉區：四行長姓名以日期列為中心展開，曾被逐字詞最近錨點切給前後兩列
  it.skipIf(!existsSync(`${dir}/4-1.bbox.html`))('4-1 長原住民姓名不跨列', () => {
    const rows = parseRegistrationBbox(readFileSync(`${dir}/4-1.bbox.html`, 'utf8'));
    const names = (d: string) => rows.filter((r) => r.district === d).map((r) => r.name);
    expect(names('屏東縣第11選舉區')).toContain('邱登星Adrucangalj·Drusaljiyan');
    expect(names('屏東縣第11選舉區')).toContain('何長成');
    expect(names('屏東縣第12選舉區')).toContain('越秋女');
  });
});
