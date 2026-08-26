// relationships-curated.json 每列 → 兩端點的解析規則。純函式，無 I/O；名冊與 entity 快取由呼叫端注入。
// 從 import-relationships.ts 搬出，行為與搬出前一致：
//   - subject 預設須為立委／首長且名冊唯一匹配（「常見名寧缺勿錯」）。
//   - subjectKind: 'entity'（2 度關係）從既有 entity 快取找，找不到就 skip——絕不因 subject 建新 entity。
//   - counterpartDistinct 有值 → 一律 entity：這是人查證過「與名冊同名者不是同一人」的標記，
//     若仍走姓名比對，哪天名冊收進同名者這筆就會靜默改連到別人身上。
//   - counterpartKind: 'official' 但名冊無唯一匹配 → 退成 entity 並標 fellThrough，讓匯入報告看得見。
import { entityWikiKey } from './entitiesWiki';

export type Roster = { id: string; name: string; office_type: string }[];
export interface EndpointRow {
  subject: string;
  subjectKind?: 'official' | 'entity';
  subjectDistinct?: string;
  counterpartName: string;
  counterpartKind: 'official' | 'entity';
  counterpartDistinct?: string;
}
export const NATIONAL: ReadonlySet<string> = new Set(['legislator', 'mayor_magistrate']);

export function officialIdIn(roster: Roster, name: string, restrict = false): string | null {
  const pool = roster.filter((o) => o.name === name && (!restrict || NATIONAL.has(o.office_type)));
  return pool.length === 1 ? pool[0].id : null;
}

export type SubjectResolution = { type: 'official' | 'entity'; id: string } | { skip: string };
export function resolveSubject(row: EndpointRow, roster: Roster, entityCache: Map<string, string>): SubjectResolution {
  if (row.subjectKind === 'entity') {
    const key = entityWikiKey(row.subject, row.subjectDistinct);
    const id = entityCache.get(key);
    return id ? { type: 'entity', id } : { skip: `subject entity 尚未建立: ${key}` };
  }
  const id = officialIdIn(roster, row.subject, true);
  return id ? { type: 'official', id } : { skip: `subject 未匹配: ${row.subject}` };
}

export type CounterpartResolution = { type: 'official'; id: string } | { type: 'entity'; fellThrough: boolean };
export function resolveCounterpart(row: EndpointRow, roster: Roster): CounterpartResolution {
  if (row.counterpartDistinct) return { type: 'entity', fellThrough: false };
  if (row.counterpartKind !== 'official') return { type: 'entity', fellThrough: false };
  const id = officialIdIn(roster, row.counterpartName);
  return id ? { type: 'official', id } : { type: 'entity', fellThrough: true };
}
