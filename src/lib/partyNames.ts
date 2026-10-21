// 只合併已確認的同黨全名／簡稱；未知名稱原樣保留，不改寫來源原文。
const PARTY_NAMES: Record<string, string> = {
  '中國國民黨': '國民黨', '民主進步黨': '民進黨',
  '台灣民眾黨': '民眾黨', '臺灣民眾黨': '民眾黨',
  '台灣團結聯盟': '台聯黨', '臺灣團結聯盟': '台聯黨',
  '臺灣基進': '台灣基進', '台灣綠黨': '綠黨', '臺灣綠黨': '綠黨',
  '無': '無黨籍', '無黨籍及未經政黨推薦': '無黨籍',
};
export const normalizeParty = (party: string) => PARTY_NAMES[party.trim()] ?? party.trim();
