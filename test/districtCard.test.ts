import { beforeAll, describe, expect, it } from 'vitest';
import { loadDistrictPages } from '../src/lib/districtPageData';
import { districtCardSvg } from '../src/lib/renderDistrictCard';
import { orderCandidates } from '../src/lib/candidateStats';

import { councilService, loadDistrictCardProfiles, type DistrictCardProfile } from '../src/lib/districtCardProfiles';
import { loadOfficials } from '../src/lib/data';
let profiles: Map<string, DistrictCardProfile>;
beforeAll(async () => { profiles = await loadDistrictCardProfiles(); });

describe('選區下載圖卡', () => {
  it('221 區完整保留 1492 人與名冊順序，不依政黨或現任身分重排', () => {
    let total = 0;
    for (const page of loadDistrictPages()) {
      const svg = districtCardSvg(page, profiles);
      const names = [...svg.matchAll(/data-candidate-name="([^"]+)"/g)].map(m =>
        m[1].replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&'));
      expect(names).toEqual(orderCandidates(page.district.candidates).map(c => c.name));
      expect(svg).toContain('width="1080"');
      total += names.length;
    }
    expect(total).toBe(1492);
  });
  it('照片對應人物，選舉日期不誤標成任期', async () => {
    const officials = await loadOfficials();
    const jian = officials.find(o => o.name === '簡舒培')!;
    expect(councilService(jian)).toEqual([{ label: '議員當選', value: '2014、2018、2022' }]);
    const page = loadDistrictPages().find(p => p.county.key === 'taipei' && p.district.no === 6)!;
    const svg = districtCardSvg(page, profiles);
    expect((svg.match(/<image /g) ?? []).length).toBe(12);
    expect(svg).toContain('照片尚未');
    expect(svg).toContain('任職資料待補');
    expect(svg).not.toContain('2022-11-26 至');
    const source = jian.careers[3].source;
    const example = { ...jian, careers: [{ id: 'service', title: '臺北市議員', organization: '臺北市議會', startDate: '2014-12-25', endDate: '2018-12-25', source }] };
    expect(councilService(example)).toEqual([{ label: '臺北市議員', value: '2014-12-25 至 2018-12-25' }]);
    expect(councilService({ ...example, careers: [{ ...example.careers[0], endDate: null }] })).toEqual([]);
  });
  it('臺北第六區列出政黨人數、範圍年份與審定階段，不捏造席次或號次', () => {
    const page = loadDistrictPages().find(p => p.county.key === 'taipei' && p.district.no === 6)!;
    const svg = districtCardSvg(page, profiles);
    expect(svg).toContain('國民黨 8 人');
    expect(svg).toContain('民進黨 4 人');
    expect(svg).toContain('行政區參考（2022 對照）');
    expect(svg).toContain('中選會審定候選人名單');
    expect(svg).toContain('2026 應選席次尚待本站核對');
    expect(svg).not.toMatch(/>\d+ 號/);
  });
});
