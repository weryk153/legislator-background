import type { EntityType, RelationType } from '../../src/lib/types';
import type { EndpointRow } from './relEndpoints';

export interface CuratedRelationship extends EndpointRow {
  // 新增批次的固定關係 ID 與查核日期。舊資料尚無這兩欄，增量匯入時略過。
  id?: string;
  reviewedAt?: string;
  counterpartRole: string;
  counterpartEntityType?: EntityType | '';
  relationType: RelationType;
  parentName?: string;
  note: string;
  sourceUrl: string;
  sourceType: 'wiki' | 'news' | 'gov';
  // 維基來源記錄查核版本；來源頁仍以可讀條目 URL 呈現。
  sourceRevision?: number;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateEntityIdentities(value: unknown): asserts value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('entity-identities 須為物件');
  const seen = new Set<string>();
  for (const [key, id] of Object.entries(value)) {
    if (!key.trim() || typeof id !== 'string' || !UUID.test(id)) throw new Error(`entity identity 格式錯誤: ${key}`);
    if (seen.has(id)) throw new Error(`entity identity ID 重複: ${id}`);
    seen.add(id);
  }
}
