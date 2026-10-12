// 黨徽來源與原始圖檔列於 public/images/parties/sources.json。
// 只對已確認的政黨名稱做精確比對，避免將無黨籍誤認為無黨團結聯盟。
const EMBLEMS: Record<string, string> = {
  '國民黨': 'kmt', '中國國民黨': 'kmt',
  '民進黨': 'dpp', '民主進步黨': 'dpp',
  '民眾黨': 'tpp', '台灣民眾黨': 'tpp', '臺灣民眾黨': 'tpp',
  '時代力量': 'npp',
  '無黨團結聯盟': 'npsu',
  '親民黨': 'pfp',
  '勞動黨': 'labor',
  '台聯黨': 'tsu', '台灣團結聯盟': 'tsu', '臺灣團結聯盟': 'tsu',
  '台灣基進': 'tsp', '臺灣基進': 'tsp',
  '正神名黨': 'zsmp',
  '新黨': 'new',
  '綠黨': 'green', '台灣綠黨': 'green',
  '社會民主黨': 'sdp',
};

export function partyEmblem(party: string): string | null {
  const key = EMBLEMS[party.trim()];
  return key ? `/images/parties/${key}.webp` : null;
}
