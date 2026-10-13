import type { GraphNode } from './types';
import { ENTITY_LABEL, OFFICE_LABEL } from './graph';
import type { EntityType } from './types';

export function relationshipIdentity(node: GraphNode): string {
  return node.kind === 'official'
    ? [node.party, node.officeType ? OFFICE_LABEL[node.officeType] : OFFICE_LABEL[node.subtype as keyof typeof OFFICE_LABEL]].filter(Boolean).join('・') || '本站政治人物'
    : node.description?.trim() || ENTITY_LABEL[node.subtype as EntityType] || '相關公眾人物';
}
