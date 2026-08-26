// 地圖分層資料的型別。scraper 產出、前端讀取，兩邊共用同一份定義，
// 避免產出端改了欄位而前端渾然不覺。

export interface PartySeat { partyCode: string; partyName: string; seats: number }

/** 連任限制的三種狀態。`unknown` 為「無法認定是否同一人」，不可與 notLimited 混為一談。 */
export type TermLimitStatus = 'limited' | 'notLimited' | 'unknown';

export interface Officeholder {
  name: string; partyCode: string; partyName: string;
  slug: string | null;          // 站上檔案頁的 slug；無背景資料者為 null
  electedBy?: 'vote' | 'quota'; // quota = 婦女保障名額當選（中選會註記 `!`）
  termLimitStatus?: TermLimitStatus; termLimitReason?: string;   // 僅縣市長有
}

/**
 * 該層級的職務在該地是否為民選。**這是制度事實，不是資料有無**。
 *
 *   `elected`   民選職務，本站有資料 → 正常顯示；沒有 chief 才是真的查無資料。
 *   `appointed` 官派職務，制度上根本沒有選舉 → 直轄市與省轄市的一般區長依
 *               地方制度法第 58 條由市長依法任用，全國 164 個區屬此類。
 *               顯示成「查無資料」會讓讀者誤以為是本站漏收。
 *   `none`      該地沒有這個職務（如未編定村里區塊、村里層沒有代表會）。
 *
 * 規格 §4.1 要求「資料深度必須看得出來」；把制度事實誤報成資料缺口是反向違反。
 */
export type OfficeStatus = 'elected' | 'appointed' | 'none';

/** 得票相同、待抽籤決定的席位（中選會註記 `?`，該檔未記抽籤結果）。 */
export interface PendingDraw { names: string[] }

export interface MapArea {
  // 中選會五段代碼（以 - 相連，保留前導零）。例外：村里層的「未編定村里」
  // 區塊（真實土地但未編定村里，不在中選會行政區樹裡，故沒有五段代碼）以
  // 「未編定:<界線檔內部編號>」表示——前綴讓呼叫端一眼看出這不是中選會代碼，
  // 同時仍是跨全國唯一值，可當多邊形的渲染 key。
  code: string; key: string; name: string;
  chief: Officeholder | null;   // 首長／鄉鎮市長／村里長；未編定村里區塊固定為 null
  seats: PartySeat[];           // 議會／代表會席次；村里層（含未編定村里區塊）為空陣列
  childFile: string | null;     // 下一層的檔名；村里層（含未編定村里區塊）為 null
  chiefOffice: OfficeStatus;    // 該地的首長職務是民選／官派／不存在
  councilOffice: OfficeStatus;  // 該地的議會／代表會是民選／不存在（不會是 appointed）
  chiefPendingDraw?: PendingDraw;  // 首長席位待抽籤（chief 為 null 時才有意義）
  seatsPendingDraw?: PendingDraw;  // 議會／代表會有席次待抽籤
  quotaSeats?: number;             // 其中屬婦女保障名額當選的席次數（中選會註記 `!`）
}

// 「未編定村里」區塊的 code 前綴（見上方 MapArea.code 註解）。scraper 產出端
// （scraper/build-election-map.ts）與前端（ElectionMap.svelte、ElectionSidebar.svelte）
// 三處都要判斷同一件事，共用這一個常數與 helper，不各自硬寫字面值，避免日後
// 改前綴時漏改一處而讓判斷悄悄失效。
export const UNASSIGNED_VILLAGE_PREFIX = '未編定:';

export function isUnassignedVillage(area: Pick<MapArea, 'code'>): boolean {
  return area.code.startsWith(UNASSIGNED_VILLAGE_PREFIX);
}

export interface MapLayer {
  level: 'national' | 'county' | 'town';
  parentName: string;
  // TopoJSON。objects 底下的物件鍵名依界線檔而定，不叫 areas ——三個實際檔案的
  // 鍵名依序是縣市層 "COUNTY_MOI_1140318"、鄉鎮市區層 "TOWN_MOI_1140318"、
  // 村里層 "V"。取用時應遍歷 Object.values(topology.objects) 拿到每個物件的
  // .geometries，不要以固定鍵名（例如 topology.objects.areas）存取，否則會拿到
  // undefined、地圖畫不出來。每個 geometry 的 properties.key 對應 MapArea.key。
  topology: unknown;
  areas: MapArea[];
}
