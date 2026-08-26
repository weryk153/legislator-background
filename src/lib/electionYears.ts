// 年份切換器的資料來源。UI（ElectionPanel.svelte）與地圖／側欄只讀這個陣列判斷
// 「這個年份有沒有結果」，不寫年份專屬的 if/else——日後要加 2018（資料已在本機）
// 或更早年份時，只要在 buildYears() 的回傳陣列多加一筆設定，UI 與鍵盤操作、
// 圖例、地圖中性色切換的邏輯完全不必碰。
export interface ElectionYearConfig {
  year: number;
  /** done：本站已有該年選舉結果，地圖照常上色、側欄照常顯示當選人。
   *  upcoming：選舉尚未舉行，地圖以中性色呈現、側欄改顯示投票日與倒數。
   *  （目前只有這兩種狀態；未來若要支援「已投票但尚未開票」等中間態，
   *  在這裡加一個新的 status 字面值，各元件的 switch/if 會在型別檢查時
   *  提示所有沒處理到新狀態的分支。） */
  status: 'done' | 'upcoming';
  /** 該屆選舉正式名稱（如「111年地方公職人員選舉」）。只有 done 才有意義。 */
  electionName?: string;
  /** upcoming 專用：投票日 ISO 日期字串（含時區），用來算倒數天數。 */
  voteDate?: string;
}

/**
 * 由 meta.json（scraper/build-election-map.ts 產出，不在本次改動範圍）與目前已知
 * 的下一屆投票日組出年份清單。meta.json 只描述「地圖現有的這份資料是哪一年」，
 * 2026 這筆（尚未舉行、故沒有對應的結果檔案）是頁面既有的公開資訊，不屬於資料
 * 管線的輸出，故在這裡（而非 scraper）補上。
 */
export function buildYears(meta: {
  electionYear: number;
  electionName: string;
  upcomingElection: string;
}): ElectionYearConfig[] {
  return [
    { year: meta.electionYear, status: 'done', electionName: meta.electionName },
    { year: 2026, status: 'upcoming', voteDate: meta.upcomingElection },
  ];
}
