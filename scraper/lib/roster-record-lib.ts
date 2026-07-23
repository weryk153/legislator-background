// 名冊修復（roster-record）純函式：slug 產生 ＋ 操作驗證。無 I/O、無 DB 寫入。
// 見 docs/superpowers/specs/2026-07-23-roster-audit-design.md「修復流程」；
// 三種操作（rename/depart/add）的欄位形狀見 scraper/roster-record.ts 檔頭註解。

export type OfficeType = 'legislator' | 'mayor_magistrate' | 'councilor';
const OFFICE_TYPES = new Set<OfficeType>(['legislator', 'mayor_magistrate', 'councilor']);

export type RenameOp = {
  op: 'rename';
  from: string; to: string; office_type: OfficeType; district: string;
  note?: string; source_url: string; source_title: string;
};
export type DepartOp = {
  op: 'depart';
  name: string; office_type: OfficeType; district: string; reason: string;
  source_url: string; source_title: string; date: string;
};
export type AddOp = {
  op: 'add';
  name: string; office_type: OfficeType; district: string; party: string; term: string;
  career_title: string; career_org: string; start_date: string;
  source_url: string; source_title: string;
};
export type ConfirmedOp = RenameOp | DepartOp | AddOp;

// 每個 op 的必填欄位（不含 op 本身、不含選填的 note）。
const REQUIRED_FIELDS: Record<ConfirmedOp['op'], string[]> = {
  rename: ['from', 'to', 'office_type', 'district', 'source_url', 'source_title'],
  depart: ['name', 'office_type', 'district', 'reason', 'source_url', 'source_title', 'date'],
  add: ['name', 'office_type', 'district', 'party', 'term', 'career_title', 'career_org', 'start_date', 'source_url', 'source_title'],
};

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

// 驗證單筆 op：op 欄位本身合法、必填欄位齊全（非空字串）、office_type 屬合法列舉值。
// 不做跨筆（如去重）檢查——那是 roster-record.ts 對 DB 現況做的事。
export function validateOp(row: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof row !== 'object' || row === null) return { ok: false, errors: ['不是物件'] };
  const r = row as Record<string, unknown>;
  const op = r.op;
  if (op !== 'rename' && op !== 'depart' && op !== 'add') {
    return { ok: false, errors: [`未知的 op: ${String(op)}（僅接受 rename/depart/add）`] };
  }
  for (const field of REQUIRED_FIELDS[op]) {
    const v = r[field];
    if (typeof v !== 'string' || v.trim() === '') errors.push(`缺欄位或為空: ${field}`);
  }
  if (typeof r.office_type === 'string' && r.office_type !== '' && !OFFICE_TYPES.has(r.office_type as OfficeType)) {
    errors.push(`office_type 不合法: ${r.office_type}（僅接受 legislator/mayor_magistrate/councilor）`);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

// 議員 slug 慣例（實查既有資料歸納）：c-{姓名}-{政黨}-{選區}，如 c-戴瑋姍-民進黨-新北市第05選舉區。
// 立委／首長的 slug 另有慣例（羅馬拼音／自訂),本函式故意只支援 councilor——
// 目前已確認的 add 名單僅有議員，非議員新增留待人工個案處理，呼叫端應視此為錯誤而非靜默降級。
export function generateCouncilorSlug(name: string, party: string, district: string): string {
  return `c-${name}-${party}-${district}`;
}
