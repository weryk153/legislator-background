import { describe, it, expect } from 'vitest';
import { planRelationshipBatch } from '../scraper/lib/relationshipBatch';
import type { CuratedRelationship } from '../scraper/lib/curatedRelationships';
import { resolveSubject, resolveCounterpart } from '../scraper/lib/relEndpoints';
import curated from '../scraper/relationships-curated.json';
import identities from '../scraper/entity-identities.json';
import officials from '../src/data/officials.json';

const id = '01f582c5-5498-4d6d-9055-52c4ed801c11';
const entityId = 'bcd3931b-15e0-430f-8034-ddb5d061e0ee';
const secondId = '3d094b24-4186-4ae4-a2dc-7b47872a6c33';
const roster = [
  { id: 'taipei', name: '李柏毅', office_type: 'councilor' },
  { id: 'kaohsiung', name: '李柏毅', office_type: 'legislator' },
];
const row: CuratedRelationship = {
  id, reviewedAt: '2026-10-13', subject: '李柏毅', subjectId: 'taipei',
  counterpartName: '李新', counterpartKind: 'entity', counterpartRole: '曾任臺北市議員',
  counterpartEntityType: 'other', relationType: 'aide', note: '李柏毅曾任李新辦公室主任。',
  sourceType: 'gov', sourceUrl: 'https://www.tcc.gov.tw/example',
};
const empty = () => ({ entities: [], sources: [], relationships: [] });
const registry = { 李新: entityId };

describe('人工審定關係增量匯入', () => {
  it('同名立委與議員由 ID 分開；ID 不符時禁止退回姓名匹配', () => {
    expect(resolveSubject(row, roster, new Map())).toEqual({ type: 'official', id: 'taipei' });
    expect(resolveSubject({ ...row, subjectId: 'missing' }, roster, new Map())).toHaveProperty('skip');
    expect(resolveCounterpart({ ...row, counterpartName: '李柏毅', counterpartKind: 'official', counterpartId: 'kaohsiung' }, roster)).toEqual({ type: 'official', id: 'kaohsiung' });
    expect(resolveCounterpart({ ...row, counterpartName: '李柏毅', counterpartKind: 'official', counterpartId: 'missing' }, roster)).toHaveProperty('skip');
  });
  it('保留原人物資料與 ID，並讓整批重跑成為 no-op', () => {
    const existing = empty();
    const plan = planRelationshipBatch([row], roster, registry, existing);
    expect(existing).toEqual(empty());
    expect(plan.entities[0].id).toBe(entityId);
    expect(plan.relationships[0]).toMatchObject({ from_id: 'taipei', to_id: entityId });
    const saved = { ...plan, entities: [{ ...plan.entities[0], description: '原有職務描述' }] };
    const retry = planRelationshipBatch([row], roster, registry, saved);
    expect(retry).toEqual({ entities: [], sources: [], relationships: [], unchanged: 1 });
    expect(saved.entities[0].description).toBe('原有職務描述');
  });
  it('來源已建立但關係尚未建立時，可以接續', () => {
    const plan = planRelationshipBatch([row], roster, registry, empty());
    const retry = planRelationshipBatch([row], roster, registry, { ...plan, relationships: [] });
    expect(retry.entities).toHaveLength(0);
    expect(retry.sources).toHaveLength(0);
    expect(retry.relationships).toEqual(plan.relationships);
  });
  it('拒絕另一 ID 的重複關係、同 ID 的內容變更、來源衝突', () => {
    const plan = planRelationshipBatch([row], roster, registry, empty());
    expect(() => planRelationshipBatch([{ ...row, id: secondId }], roster, registry, plan)).toThrow('關係已存在');
    expect(() => planRelationshipBatch([{ ...row, note: 'different' }], roster, registry, plan)).toThrow('內容不同');
    expect(() => planRelationshipBatch([row], roster, registry, { ...plan, relationships: [], sources: [{ ...plan.sources[0], url: 'https://different.test' }] })).toThrow('來源 ID');
  });
  it('新人物不可只靠姓名臆造，親子方向必須指定', () => {
    expect(() => planRelationshipBatch([row], roster, {}, empty())).toThrow('尚未登記');
    expect(() => planRelationshipBatch([{ ...row, relationType: 'parent_child' }], roster, registry, empty())).toThrow('親子方向');
    const plan = planRelationshipBatch([{ ...row, relationType: 'parent_child', parentName: '李新' }], roster, registry, empty());
    expect(plan.relationships[0]).toMatchObject({ from_id: entityId, to_id: 'taipei', directed: true });
  });
  it('缺漏查核日期／端點 ID／來源時，在寫入前失敗', () => {
    for (const patch of [{ reviewedAt: '2026-02-30' }, { subjectId: undefined }, { sourceUrl: 'javascript:alert(1)' }, { id: undefined }]) {
      expect(() => planRelationshipBatch([{ ...row, ...patch }], roster, registry, empty())).toThrow();
    }
  });
  it('本批資料全部解析至既有名冊，來源齊全，沒有重複身分或關係', () => {
    const batch = curated.filter(r => 'reviewedAt' in r) as CuratedRelationship[];
    const actualRoster = officials.map(o => ({ id: o.id, name: o.name, office_type: o.officeType }));
    const plan = planRelationshipBatch(batch, actualRoster, identities, empty());
    expect(plan.relationships).toHaveLength(batch.length);
    expect(batch.length).toBeGreaterThanOrEqual(50);
    expect(batch.filter(r => r.sourceType === 'wiki').every(r => Number.isInteger(r.sourceRevision))).toBe(true);
    expect(plan.relationships.find(r => batch.find(b => b.id === r.id)?.subject === '李柏毅')?.from_id).toBe('490589ae-c054-4e1b-b4da-6a8bbc7951db');
  });
});
