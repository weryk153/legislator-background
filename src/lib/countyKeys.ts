// 縣市名 ↔ 網址 key ↔ 地圖／候選人檔的縣市代碼。2026 縣市選舉頁 /elections/2026/<key>/、
// 個人頁的參選標記連結、分享縮圖檔名都用這份對照，不各自拼字串。
//
// key 沿用站上縣市長檔案的 slug 去掉「mayor-」（mayor-new-taipei → new-taipei），
// 縣市長換人時 slug 不變，網址也就跟著固定。順序與 public/data/candidates/2026/national.json
// 的 races 一致：六都在前，其餘依縣市代碼。

export interface CountyKey {
  name: string;   // 縣市名，與中選會名冊、地圖檔一致（用「臺」）
  key: string;    // 網址用
  code: string;   // 地圖檔與候選人檔的縣市代碼
}

export const COUNTY_KEYS: readonly CountyKey[] = [
  { name: '臺北市', key: 'taipei', code: '63-000-00-000-0000' },
  { name: '新北市', key: 'new-taipei', code: '65-000-00-000-0000' },
  { name: '桃園市', key: 'taoyuan', code: '68-000-00-000-0000' },
  { name: '臺中市', key: 'taichung', code: '66-000-00-000-0000' },
  { name: '臺南市', key: 'tainan', code: '67-000-00-000-0000' },
  { name: '高雄市', key: 'kaohsiung', code: '64-000-00-000-0000' },
  { name: '連江縣', key: 'lienchiang', code: '09-007-00-000-0000' },
  { name: '金門縣', key: 'kinmen', code: '09-020-00-000-0000' },
  { name: '宜蘭縣', key: 'yilan', code: '10-002-00-000-0000' },
  { name: '新竹縣', key: 'hsinchu-county', code: '10-004-00-000-0000' },
  { name: '苗栗縣', key: 'miaoli', code: '10-005-00-000-0000' },
  { name: '彰化縣', key: 'changhua', code: '10-007-00-000-0000' },
  { name: '南投縣', key: 'nantou', code: '10-008-00-000-0000' },
  { name: '雲林縣', key: 'yunlin', code: '10-009-00-000-0000' },
  { name: '嘉義縣', key: 'chiayi-county', code: '10-010-00-000-0000' },
  { name: '屏東縣', key: 'pingtung', code: '10-013-00-000-0000' },
  { name: '臺東縣', key: 'taitung', code: '10-014-00-000-0000' },
  { name: '花蓮縣', key: 'hualien', code: '10-015-00-000-0000' },
  { name: '澎湖縣', key: 'penghu', code: '10-016-00-000-0000' },
  { name: '基隆市', key: 'keelung', code: '10-017-00-000-0000' },
  { name: '新竹市', key: 'hsinchu-city', code: '10-018-00-000-0000' },
  { name: '嘉義市', key: 'chiayi-city', code: '10-020-00-000-0000' },
];

const byKey = new Map(COUNTY_KEYS.map((c) => [c.key, c]));
const byCode = new Map(COUNTY_KEYS.map((c) => [c.code, c]));
const byName = new Map(COUNTY_KEYS.map((c) => [c.name, c]));

export const countyByKey = (key: string): CountyKey | undefined => byKey.get(key);
export const countyByCode = (code: string): CountyKey | undefined => byCode.get(code);
export const countyByName = (name: string): CountyKey | undefined => byName.get(name);

/** 縣市選舉頁網址（站內相對路徑，結尾斜線）。 */
export const countyPagePath = (key: string): string => `/elections/2026/${key}/`;
