// ardata 專戶 → officials 身分比對。寧缺勿錯：只在「姓名完全相等 + 選舉類型與
// office_type 一致 + 現任 + 唯一」時 matched；其餘 none/ambiguous 進 review 清單。
export interface OfficialLite {
  id: string; name: string;
  office_type: 'legislator' | 'mayor_magistrate' | 'councilor';
  district: string; is_incumbent: boolean;
}

export type MatchResult =
  | { status: 'matched'; officialId: string }
  | { status: 'none' | 'ambiguous'; reason: string };

/** 從 ardata 選舉名稱推公職類型；認不出（總統、山地原民鄉長等）回 null。 */
export function officeTypeOfElection(electionName: string): OfficialLite['office_type'] | null {
  const s = electionName ?? '';
  if (/立法委員/.test(s)) return 'legislator';
  if (/議員/.test(s)) return 'councilor';
  // 平台實際名稱：「111年縣(市)長選舉」「111年直轄市市長選舉」。鄉鎮市長/村里長/區長等
  // 非本站範圍，且名稱都帶「鄉/鎮/村/里/區/苗栗市市長補選」等前綴 — 用排除法擋掉。
  if (/(鄉|鎮|村|里|區)/.test(s)) return null;
  if (/(縣\(市\)長|直轄市市長)/.test(s)) return 'mayor_magistrate';
  return null;
}

export function matchAccount(
  account: { name: string; electionName: string },
  officials: OfficialLite[],
): MatchResult {
  const office = officeTypeOfElection(account.electionName);
  if (!office) return { status: 'none', reason: `選舉類型不明: ${account.electionName}` };
  const hits = officials.filter(
    (o) => o.is_incumbent && o.name === account.name && o.office_type === office,
  );
  if (hits.length === 1) return { status: 'matched', officialId: hits[0].id };
  if (hits.length === 0) return { status: 'none', reason: '查無同名現任者' };
  return {
    status: 'ambiguous',
    reason: `同名同職類 ${hits.length} 人: ${hits.map((h) => h.district).join(' / ')}`,
  };
}
