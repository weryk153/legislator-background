// 名單換版（登記 → 審定 → 號次 → 公告）時的差異報告，人工檢閱後才 commit。
import type { CandidateEntry, CountyCandidates, NationalCandidates } from '../../src/lib/candidateTypes';
import { nameKey } from './candidateLinks';

export interface DiffLine { kind: 'added' | 'removed' | 'partyChanged' | 'numberChanged'; race: string; name: string; detail: string }
type Flat = Map<string, { race: string; c: CandidateEntry }>;

export function flatten(national: NationalCandidates | null, counties: CountyCandidates[]): Flat {
  const m: Flat = new Map();
  const put = (race: string, c: CandidateEntry) => m.set(`${race}|${nameKey(c.name)}`, { race, c });
  for (const r of national?.races ?? []) for (const c of r.candidates) put(r.countyName, c);
  for (const co of counties) for (const d of co.districts) for (const c of d.candidates) put(`${co.countyName}${d.label}`, c);
  return m;
}

export function diffCandidates(prev: Flat | null, next: Flat): DiffLine[] | null {
  if (prev === null) return null;
  const out: DiffLine[] = [];
  for (const [k, { race, c }] of next) {
    const p = prev.get(k);
    if (!p) { out.push({ kind: 'added', race, name: c.name, detail: c.partyName }); continue; }
    if (p.c.partyName !== c.partyName) out.push({ kind: 'partyChanged', race, name: c.name, detail: `${p.c.partyName} → ${c.partyName}` });
    if (p.c.number !== c.number) out.push({ kind: 'numberChanged', race, name: c.name, detail: `${p.c.number ?? '—'} → ${c.number ?? '—'}` });
  }
  for (const [k, { race, c }] of prev) {
    if (!next.has(k)) out.push({ kind: 'removed', race, name: c.name, detail: c.slug ? `有站上檔案 ${c.slug}` : '' });
  }
  return out;
}

const KIND_LABEL = { added: '新增', removed: '移除', partyChanged: '改推薦政黨', numberChanged: '號次變動' } as const;

export function renderDiff(lines: DiffLine[] | null): string {
  if (lines === null) return '# 候選人名單差異\n\n首次產出，無前一版可比對。\n';
  if (lines.length === 0) return '# 候選人名單差異\n\n與前一版完全相同。\n';
  const body = lines.map((l) => `- ${KIND_LABEL[l.kind]}｜${l.race}｜${l.name}${l.detail ? `｜${l.detail}` : ''}`).join('\n');
  const removed = lines.filter((l) => l.kind === 'removed');
  const hint = removed.length
    ? `\n\n**有 ${removed.length} 人被移除**：請檢查其個人檔案頁的 2026 參選標記，以及（六都因參選建檔者）檔案是否需撤除或改標示。\n`
    : '\n';
  return `# 候選人名單差異\n\n${body}${hint}`;
}
