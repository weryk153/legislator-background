import type { Official } from './types';

export function validateOfficial(o: Official): string[] {
  const errors: string[] = [];

  for (const j of o.judgments) {
    if (!j.source) errors.push(`judgment ${j.id}: missing source`);
    if (!j.outcome?.trim()) errors.push(`judgment ${j.id}: missing outcome`);
    if (typeof j.isFinal !== 'boolean') errors.push(`judgment ${j.id}: isFinal must be boolean`);
  }
  for (const c of o.careers) {
    if (!c.source) errors.push(`career ${c.id}: missing source`);
  }
  for (const c of o.controversies) {
    if (!c.sources || c.sources.length === 0) errors.push(`controversy ${c.id}: needs at least one source`);
    if (!c.status) errors.push(`controversy ${c.id}: missing status`);
    if (!c.reportDate) errors.push(`controversy ${c.id}: missing reportDate`);
  }
  for (const a of o.assets) {
    if (!a.source) errors.push(`asset ${a.id}: missing source`);
  }
  return errors;
}

export function validateAll(officials: Official[]): string[] {
  return officials.flatMap((o) => validateOfficial(o).map((e) => `${o.name}: ${e}`));
}
