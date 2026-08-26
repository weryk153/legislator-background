// 台灣本島＋鄰近可呈現島嶼（含金門、馬祖、綠島、蘭嶼、龜山島）的地理範圍。
//
// 目視驗證選舉地圖時發現兩個界線檔本身就有的、規格書沒提到的極端外島，兩者都會把
// d3-geo fitExtent 的座標範圍撐大、把本島壓成一小塊：
//   1. 高雄市旗津區依法轄有南海的東沙島、太平島，經緯度與本島差了數千公里，在全國層
//      （高雄市多邊形本身）、下鑽高雄市後的鄉鎮市區層（旗津區多邊形本身）都會出現；
//      旗津區的村里層則是兩座島各自獨立成一筆「未編定村里」，本身無村里長、無選舉
//      意義，整筆濾掉不畫。
//   2. 宜蘭縣頭城鎮大溪里依法轄有東北方的釣魚台列嶼，與本島距離較近但仍有一百多公里，
//      同樣在全國層（宜蘭縣）、頭城鎮層（大溪里）出現；大溪里本身是有里長的真實村里，
//      不可整筆濾掉，僅濾除該 MultiPolygon 裡屬於釣魚台列嶼的部件，保留大溪里本體。
// 兩案例分別驗證了 clipFarExclaves 對 Polygon（整筆濾除）與 MultiPolygon（僅濾除
// 越界部件）兩種型別的處理都要正確。
//
// 這個範圍矩形與下面的濾除邏輯只看每個環（ring）的「第一個座標點」，效率換來的代價
// 是：一旦某個環的座標序列剛好跨越矩形邊界（一部分在內、一部分在外），會被整環誤判。
// 目前這批界線檔沒有這種跨界的環（見 test/mapExclaves.test.ts 全量驗證），但這純粹是
// 這批資料剛好如此，不是這個矩形保證如此。界線檔換版後若破壞了這個假設，地圖會在
// 沒有任何錯誤訊息的情況下悄悄少畫一塊——所以由該測試逐檔逐環掃描，斷言「頭點判定」
// 與「全環判定」一致，且範圍外的環清單就是這裡文件記載的兩個已知案例，不多不少。
// 這個常數與函式是前端地圖元件（ElectionMap.svelte）與該測試共用的單一事實來源。
export const TW_ENVELOPE = { minLon: 117, maxLon: 122.3, minLat: 21.7, maxLat: 26.5 };

export type LonLat = [number, number];

export function inEnvelope([lon, lat]: LonLat): boolean {
  return lon >= TW_ENVELOPE.minLon && lon <= TW_ENVELOPE.maxLon &&
    lat >= TW_ENVELOPE.minLat && lat <= TW_ENVELOPE.maxLat;
}

// 整個環是否全部落在範圍內；只在測試裡用來跟「只看第一點」的結果比對一致性。
export function ringAllInEnvelope(ring: readonly LonLat[]): boolean {
  return ring.every(inEnvelope);
}

// Polygon 整筆落在範圍外者回傳 null（不畫）；MultiPolygon 只濾掉範圍外的部件，保留本體。
export function clipFarExclaves(f: any): any | null {
  const geom = f?.geometry;
  if (!geom) return f;
  if (geom.type === 'Polygon') {
    return inEnvelope(geom.coordinates[0][0]) ? f : null;
  }
  if (geom.type === 'MultiPolygon') {
    const kept = geom.coordinates.filter((poly: any) => inEnvelope(poly[0][0]));
    if (!kept.length) return null;
    if (kept.length === geom.coordinates.length) return f;
    return { ...f, geometry: { ...geom, coordinates: kept } };
  }
  return f;
}
