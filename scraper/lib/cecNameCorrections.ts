// 中選會姓名造字碼：僅對經官方名冊／公報確認的完整姓名轉換。
// 不同機關的 PUA 碼位並不通用；不可把此表當成通用字元替換表。
// PDF 的部分姓名是圖像，已對照實際頁面字形。林𬧷昌的「車孟」字另對照：
// https://www.cns11643.gov.tw/wordView.jsp?ID=877868
export const CEC_NAME_CORRECTIONS = [
  { raw: '江\uE018淵', name: '江聰淵', source: 'https://web.cec.gov.tw/api/file/95022307-29bc-4a76-9fd0-b08ebf551914.pdf' },
  { raw: '吳佳\uE032', name: '吳佳𠧊', source: 'https://www.chc.moj.gov.tw/296309/296339/296347/971632/978557/' },
  { raw: '謝正\uE060', name: '謝正直', source: 'https://jiali722.tainan.gov.tw/News_Content.aspx?n=7185&s=7928120' },
  { raw: '徐\uE018謀', name: '徐聰謀', source: 'https://2022.cec.gov.tw/data/file/15e72c1377d941b19750fe0b46e3bf1f.pdf' },
  { raw: '廖\uE014歆', name: '廖𫎇歆', source: 'https://2022.cec.gov.tw/data/file/15e72c1377d941b19750fe0b46e3bf1f.pdf' },
  { raw: '許\uE018民', name: '許聰民', source: 'https://2022.cec.gov.tw/data/file/15e72c1377d941b19750fe0b46e3bf1f.pdf' },
  { raw: '蘇世\uE038', name: '蘇世杞', source: 'https://www.chc.moj.gov.tw/296309/296339/296347/971632/978209/' },
  { raw: '鐘婕\uE040', name: '鐘婕瑜', source: 'https://2022.cec.gov.tw/data/file/15e72c1377d941b19750fe0b46e3bf1f.pdf' },
  { raw: '曾銪\uE063', name: '曾銪寪', source: 'https://2022.cec.gov.tw/data/file/15e72c1377d941b19750fe0b46e3bf1f.pdf#page=191' },
  { raw: '蔡\uE018連', name: '蔡聰連', source: 'https://web.cec.gov.tw/api/file/bed4b98c-d0ad-4d7c-971b-d610e0892b30.pdf' },
  { raw: '劉貴\uE015', name: '劉貴㨗', source: 'https://2022.cec.gov.tw/data/file/15e72c1377d941b19750fe0b46e3bf1f.pdf' },
  { raw: '賴\uE018禮', name: '賴聰禮', source: 'https://www.tainan.gov.tw/News.aspx?n=2796&sms=14459' },
  { raw: '駱錫\uE018', name: '駱錫聰', source: 'https://web.cec.gov.tw/api/file/0f0635c0-ca8e-4339-85bb-8dfd3263beab.pdf' },
  { raw: '林\uE031昌', name: '林𬧷昌', source: 'https://2022.cec.gov.tw/data/file/15e72c1377d941b19750fe0b46e3bf1f.pdf#page=19' },
  { raw: '曾\uE03C樺', name: '曾渝樺', source: 'https://2022.cec.gov.tw/data/file/15e72c1377d941b19750fe0b46e3bf1f.pdf#page=101' },
  { raw: '張明\uE018', name: '張明聰', source: 'https://web.cec.gov.tw/api/file/bed4b98c-d0ad-4d7c-971b-d610e0892b30.pdf' },
  { raw: '郭\uE018德', name: '郭聰德', source: 'https://2022.cec.gov.tw/data/file/15e72c1377d941b19750fe0b46e3bf1f.pdf' },
  { raw: '許\uE011燕雀', name: '許𡍼燕雀', source: 'https://2022.cec.gov.tw/data/file/15e72c1377d941b19750fe0b46e3bf1f.pdf' },
  { raw: '陳\uE062瑜', name: '陳啓瑜', source: 'https://www.tainan.gov.tw/News.aspx?n=2797&sms=14460' },
  { raw: '黃\uE018惠', name: '黃聰惠', source: 'https://jiangjun.tainan.gov.tw/News_Content.aspx?n=7233&s=75180' },
  { raw: '洪智\uE015', name: '洪智㨗', source: 'https://2022.cec.gov.tw/data/file/15e72c1377d941b19750fe0b46e3bf1f.pdf' },
  { raw: '黃勝\uE018', name: '黃勝聰', source: 'https://2022.cec.gov.tw/data/file/15e72c1377d941b19750fe0b46e3bf1f.pdf' },
  { raw: '張綾\uE05D', name: '張綾祐', source: 'https://2022.cec.gov.tw/data/file/15e72c1377d941b19750fe0b46e3bf1f.pdf#page=62' },
  { raw: '葉\uE048', name: '葉麵', source: 'https://2022.cec.gov.tw/data/file/15e72c1377d941b19750fe0b46e3bf1f.pdf#page=507' },
  { raw: '林\uE019良', name: '林䧮良', source: 'https://www.chc.moj.gov.tw/296309/296339/296347/971632/978517/' },
  { raw: '林敏\uE015', name: '林敏㨗', source: 'https://2022.cec.gov.tw/data/file/15e72c1377d941b19750fe0b46e3bf1f.pdf' },
  { raw: '楊\uE018進', name: '楊聰進', source: 'https://data.tainan.gov.tw/Resource/61a070ee-efaa-4614-8743-80eb7fe508de' },
  { raw: '何\uE005杏', name: '何㳵杏', source: 'https://2022.cec.gov.tw/data/file/15e72c1377d941b19750fe0b46e3bf1f.pdf#page=187' },
  { raw: '潘\uE061伶', name: '潘沿伶', source: 'https://web.cec.gov.tw/api/file/3587f241-6247-4c10-af27-b01b9445e1cc.pdf' },
  { raw: '藍\uE018信', name: '藍聰信', source: 'https://www.kmdn.gov.tw/1117/1271/1272/583930/?cprint=pt' },
  { raw: '嚴珮\uE040', name: '嚴珮瑜', source: 'https://2022.cec.gov.tw/data/file/22a9d408808d46fdb8f8373188eea473.pdf' },
] as const;

const names = new Map<string, string>(CEC_NAME_CORRECTIONS.map(({ raw, name }) => [raw, name]));

export function normalizeCecCandidateName(name: string): string {
  return names.get(name) ?? name;
}
