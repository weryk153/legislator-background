import type { RelationType } from './types';

// 關係線索：cue 關鍵字 → relationType。只做「候選」標記，務必人工校對。
const CUES: { re: RegExp; relationType: RelationType; cue: string }[] = [
  { re: /配偶|夫|妻|先生|太太/, relationType: 'spouse', cue: '配偶' },
  { re: /兒子|女兒|父|母|父親|母親/, relationType: 'parent_child', cue: '親子' },
  { re: /兄|弟|姊|妹|兄弟|姊妹/, relationType: 'sibling', cue: '手足' },
  { re: /助理/, relationType: 'aide', cue: '助理' },
  { re: /共同被告|同案|共犯/, relationType: 'co_case', cue: '同案' },
  { re: /樁腳|金主|政治獻金/, relationType: 'backer', cue: '金主' },
];

// 抓 cue 前後最近的中文姓名（2–3 字）。粗略、僅供候選；不確定回空名字。
const NAME = /[一-鿿]{2,3}/g;

export function extractCandidates(text: string): { relationType: RelationType; counterpartName: string; cue: string }[] {
  if (!text) return [];
  const out: { relationType: RelationType; counterpartName: string; cue: string }[] = [];
  for (const { re, relationType, cue } of CUES) {
    const m = re.exec(text);
    if (!m) continue;
    // 取 cue 詞後方緊鄰的姓名（如「配偶白惠萍」）
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
    const name = (after.match(NAME) ?? [])[0] ?? '';
    out.push({ relationType, counterpartName: name, cue });
  }
  return out;
}
