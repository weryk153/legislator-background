// 2026 候選人資料的型別。scraper（產出）與前端（讀取）共用同一份，不各自宣告。

/** 議員選區類型。unknown：2026 選區與 2022 對不上，類型無從得知（見 spec §2.3）。 */
export type DistrictType = 'regional' | 'plainIndigenous' | 'mountainIndigenous' | 'unknown';
