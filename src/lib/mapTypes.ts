// 地圖分層資料的型別。scraper 產出、前端讀取，兩邊共用同一份定義，
// 避免產出端改了欄位而前端渾然不覺。

export interface PartySeat { partyCode: string; partyName: string; seats: number }

export interface Officeholder {
  name: string; partyCode: string; partyName: string;
  slug: string | null;          // 站上檔案頁的 slug；無背景資料者為 null
  termLimited?: boolean; termLimitReason?: string;   // 僅縣市長有
}

export interface MapArea {
  // 中選會五段代碼（以 - 相連，保留前導零）。例外：村里層的「未編定村里」
  // 區塊（真實土地但未編定村里，不在中選會行政區樹裡，故沒有五段代碼）以
  // 「未編定:<界線檔內部編號>」表示——前綴讓呼叫端一眼看出這不是中選會代碼，
  // 同時仍是跨全國唯一值，可當多邊形的渲染 key。
  code: string; key: string; name: string;
  chief: Officeholder | null;   // 首長／鄉鎮市長／村里長；未編定村里區塊固定為 null
  seats: PartySeat[];           // 議會／代表會席次；村里層（含未編定村里區塊）為空陣列
  childFile: string | null;     // 下一層的檔名；村里層（含未編定村里區塊）為 null
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
