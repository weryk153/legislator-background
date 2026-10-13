import { RELATION_LABEL } from '../../src/lib/graph';
import { entityWikiKey } from './entitiesWiki';
import { resolveSubject, resolveCounterpart, type Roster } from './relEndpoints';
import { UUID, validateEntityIdentities, type CuratedRelationship } from './curatedRelationships';

export type BatchEntity = { id: string; name: string; entity_type: string; description: string };
export type BatchSource = { id: string; url: string; type: string; title: string; retrieved_at: string };
export type BatchRelationship = {
  id: string; from_type: 'official' | 'entity'; from_id: string;
  to_type: 'official' | 'entity'; to_id: string; relation_type: string;
  directed: boolean; note: string | null; source_id: string;
};
const entityTypes = new Set(['businessperson', 'religious', 'celebrity', 'media', 'family_member', 'organization', 'other']);
const edgeKey = (r: BatchRelationship) => {
  const pair = [`${r.from_type}:${r.from_id}`, `${r.to_type}:${r.to_id}`];
  return `${(r.directed ? pair : pair.sort()).join('|')}|${r.relation_type}|${r.directed}`;
};

// 全批先驗證、再寫入。只接受附固定 ID、名冊 ID 及查核日期的人工審定列。
// 不以姓名自動合併 entity，也不在 ID 不符時退回姓名搜尋或建立另一個人。
export function planRelationshipBatch(
  rows: CuratedRelationship[], roster: Roster, identities: Record<string, string>,
  existing: { entities: BatchEntity[]; sources: BatchSource[]; relationships: BatchRelationship[] },
) {
  validateEntityIdentities(identities);
  const entities = new Map(existing.entities.map((e) => [e.id, e]));
  const sources = new Map(existing.sources.map((s) => [s.id, s]));
  const relationships = new Map(existing.relationships.map((r) => [r.id, r]));
  const pairs = new Map(existing.relationships.map((r) => [edgeKey(r), r.id]));
  const newEntities: BatchEntity[] = [], newSources: BatchSource[] = [], newRelationships: BatchRelationship[] = [];
  const seen = new Set<string>();
  let unchanged = 0;
  for (const r of rows) {
    if (!r.id && !r.reviewedAt && !r.subjectId && !r.counterpartId) continue;
    if (!r.id || !UUID.test(r.id) || seen.has(r.id)) throw new Error(`關係 ID 缺漏／重複: ${r.subject}`);
    seen.add(r.id);
    if (!r.reviewedAt || !/^\d{4}-\d{2}-\d{2}$/.test(r.reviewedAt)
      || Number.isNaN(Date.parse(r.reviewedAt)) || new Date(r.reviewedAt).toISOString().slice(0, 10) !== r.reviewedAt) {
      throw new Error(`查核日期錯誤: ${r.subject}`);
    }
    if (!['wiki', 'news', 'gov'].includes(r.sourceType) || !/^https?:\/\//.test(r.sourceUrl)
      || !r.note?.trim() || !Object.hasOwn(RELATION_LABEL, r.relationType) || r.relationType === 'party_bloc') {
      throw new Error(`來源／說明／關係類型錯誤: ${r.subject}`);
    }
    const sourceUrl = new URL(r.sourceUrl);
    if (sourceUrl.username || sourceUrl.password) throw new Error(`來源 URL 不可含認證資料: ${r.subject}`);
    if (!r.subjectId || r.subjectKind === 'entity') throw new Error(`新增主體須附公職名冊 ID: ${r.subject}`);
    const subject = resolveSubject(r, roster, new Map());
    if ('skip' in subject) throw new Error(subject.skip);
    if (r.counterpartKind === 'official' && !r.counterpartId) throw new Error(`counterpart 須附名冊 ID: ${r.counterpartName}`);
    const cp = resolveCounterpart(r, roster);
    if ('skip' in cp) throw new Error(cp.skip);
    let counterpart: { type: 'official' | 'entity'; id: string };
    if (cp.type === 'official') counterpart = cp;
    else {
      const key = entityWikiKey(r.counterpartName, r.counterpartDistinct);
      const id = identities[key];
      if (!id) throw new Error(`entity 尚未登記身分 ID: ${key}`);
      const entity = entities.get(id);
      if (entity && entity.name !== r.counterpartName) throw new Error(`entity ID／姓名不符: ${key}`);
      if (!entity) {
        if (!r.counterpartRole?.trim() || !entityTypes.has(r.counterpartEntityType ?? '')) throw new Error(`entity 身分資料不足: ${key}`);
        const next = { id, name: r.counterpartName, entity_type: r.counterpartEntityType!, description: r.counterpartRole };
        entities.set(id, next); newEntities.push(next);
      }
      counterpart = { type: 'entity', id };
    }
    if (subject.type === counterpart.type && subject.id === counterpart.id) throw new Error(`禁止自連: ${r.subject}`);
    const directed = r.relationType === 'parent_child';
    if (directed && ![r.subject, r.counterpartName].includes(r.parentName ?? '')) throw new Error(`親子方向未確認: ${r.subject}`);
    const [from, to] = directed && r.parentName === r.counterpartName ? [counterpart, subject] : [subject, counterpart];
    const next: BatchRelationship = {
      id: r.id, from_type: from.type, from_id: from.id, to_type: to.type, to_id: to.id,
      relation_type: r.relationType, directed, note: r.note, source_id: r.id,
    };
    const previous = relationships.get(r.id);
    if (previous) {
      if (Object.entries(next).some(([k, v]) => previous[k as keyof BatchRelationship] !== v)) throw new Error(`既有關係 ID 內容不同: ${r.subject}—${r.counterpartName}`);
      const src = sources.get(previous.source_id);
      if (!src || src.url !== r.sourceUrl || src.type !== r.sourceType || src.retrieved_at !== r.reviewedAt) throw new Error(`既有來源與審定資料不同: ${r.subject}`);
      unchanged++; continue;
    }
    if (pairs.has(edgeKey(next))) throw new Error(`關係已存在（另一個 ID）: ${r.subject}—${r.counterpartName}`);
    pairs.set(edgeKey(next), next.id); relationships.set(next.id, next);
    const source: BatchSource = { id: r.id, url: r.sourceUrl, type: r.sourceType, title: `${r.subject}關係資料：${r.relationType}`, retrieved_at: r.reviewedAt };
    const previousSource = sources.get(source.id);
    if (previousSource) {
      if (Object.entries(source).some(([k, v]) => previousSource[k as keyof BatchSource] !== v)) throw new Error(`來源 ID 已用於其他資料: ${r.id}`);
    } else { sources.set(source.id, source); newSources.push(source); }
    newRelationships.push(next);
  }
  return { entities: newEntities, sources: newSources, relationships: newRelationships, unchanged };
}
