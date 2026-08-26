// 地圖分層資料的型別。scraper 產出、前端讀取，兩邊共用同一份定義，
// 避免產出端改了欄位而前端渾然不覺。

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
