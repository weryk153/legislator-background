// 爭議記錄（controversies-record）純函式：欄位驗證、來源類型判斷、去重鍵。無 I/O。

export const STATUSES = ['investigating', 'indicted', 'first_instance', 'settled', 'cleared', 'other'] as const;
export type ControversyStatus = typeof STATUSES[number];

export interface ConfirmedSource { url: string; title: string; publisher?: string; date?: string }
export interface ConfirmedControversy {
  slug: string;
  title: string;
  summary: string;
  status: ControversyStatus;
  event_date: string;
  sources: ConfirmedSource[];
  /** 審核依據：誰在何時核准（例：「使用者 2026-10-05 審核頁核准」）。只留紀錄，不入庫。 */
  approved_by: string;
}

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

export function validateControversy(row: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof row !== 'object' || row === null) return { ok: false, errors: ['不是物件'] };
  const r = row as Record<string, unknown>;
  for (const k of ['slug', 'title', 'summary', 'event_date', 'approved_by']) {
    if (typeof r[k] !== 'string' || !(r[k] as string).trim()) errors.push(`缺欄位或為空: ${k}`);
  }
  if (!STATUSES.includes(r.status as ControversyStatus)) errors.push(`status 不合法: ${String(r.status)}`);
  if (typeof r.event_date === 'string' && r.event_date && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(r.event_date)) {
    errors.push(`event_date 格式須為 YYYY、YYYY-MM 或 YYYY-MM-DD: ${r.event_date}`);
  }
  const sources = r.sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push('至少要有一個來源');
  } else {
    sources.forEach((s, i) => {
      const src = s as Record<string, unknown>;
      if (typeof src?.url !== 'string' || !/^https?:\/\//.test(src.url)) errors.push(`sources[${i}].url 不合法`);
      if (typeof src?.title !== 'string' || !src.title.trim()) errors.push(`sources[${i}].title 為空`);
      if (typeof src?.url === 'string' && /wikipedia\.org/.test(src.url) && sources.length === 1) {
        errors.push('不可只以維基百科為來源');
      }
    });
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

/** 來源網址 → sources.type。判決書為 court、事實查核為 factcheck、政府網站為 gov，其餘視為新聞。 */
export function sourceTypeOf(url: string): 'court' | 'factcheck' | 'gov' | 'news' {
  const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  if (/(^|\.)judicial\.gov\.tw$/.test(host)) return 'court';
  if (/(^|\.)(tfc-taiwan\.org\.tw|mygopen\.com|cofacts\.tw)$/.test(host)) return 'factcheck';
  if (/\.gov\.tw$/.test(host)) return 'gov';
  return 'news';
}

/** 去重：同一人、標題正規化後相同視為同一筆（可重跑）。 */
export const dedupeKey = (officialId: string, title: string) =>
  `${officialId}|${title.replace(/\s+/g, '').replace(/台/g, '臺')}`;
