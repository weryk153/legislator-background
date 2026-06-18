export function judgmentKey(j: { court: string; caseNumber: string }): string {
  return `${j.court}|${j.caseNumber}`;
}
export function assetKey(targetId: string, a: { year: number }): string {
  return `${targetId}|${a.year}`;
}
export function careerKey(targetId: string, c: { organization: string; startDate: string }): string {
  return `${targetId}|${c.organization}|${c.startDate}`;
}
export function controversyKey(targetId: string, c: { title: string }): string {
  return `${targetId}|${c.title}`;
}
