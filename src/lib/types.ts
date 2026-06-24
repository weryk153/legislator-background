export type OfficeType = 'legislator' | 'mayor_magistrate' | 'councilor';
export type ControversyStatus =
  | 'investigating' | 'indicted' | 'first_instance' | 'settled' | 'cleared' | 'other';
export type SourceType = 'court' | 'news' | 'gov' | 'gazette' | 'factcheck' | 'wiki';

export interface Source { id: string; url: string; type: SourceType; title: string; retrievedAt: string; }
export interface Career { id: string; title: string; organization: string; startDate: string; endDate: string | null; source: Source; }
export interface Judgment { id: string; caseReason: string; court: string; caseNumber: string; outcome: string; isFinal: boolean; judgmentDate: string; judgmentUrl: string; source: Source; }
export interface Controversy { id: string; title: string; summary: string; status: ControversyStatus; eventDate: string; reportDate: string; sources: Source[]; }
export type AssetCategory =
  | 'land' | 'building' | 'cash' | 'deposit' | 'securities' | 'investment' | 'claim' | 'debt' | 'other';
export interface AssetItem { category: AssetCategory; amount: number; label: string | null; }
export interface AssetDeclaration { id: string; year: number; items: AssetItem[]; source: Source; }

export interface Official {
  id: string; slug: string; name: string; party: string; officeType: OfficeType; district: string;
  term: string; photoUrl: string | null; bio: string; isIncumbent: boolean; departedReason: string | null;
  careers: Career[]; judgments: Judgment[]; controversies: Controversy[]; assets: AssetDeclaration[];
}

export interface OfficialListRow {
  id: string; slug: string; name: string; party: string; officeType: OfficeType; district: string; region: string;
  judgmentCount: number; controversyCount: number; latestAssetTotal: number | null; departed: boolean;
}

export type EntityType =
  | 'businessperson' | 'religious' | 'celebrity' | 'media' | 'family_member' | 'organization' | 'other';
export type RelationType =
  | 'spouse' | 'parent_child' | 'sibling' | 'relative'
  | 'faction' | 'mentor' | 'party_bloc' | 'aide' | 'backer' | 'co_case';
export type NodeRefType = 'official' | 'entity';

// Raw DB rows (snake_case), source nested via PostgREST join.
export interface RawEntity {
  id: string; name: string; entity_type: EntityType; description: string;
  photo_url: string | null; wikipedia_url: string | null;
}
export interface RawRelationship {
  id: string; from_type: NodeRefType; from_id: string; to_type: NodeRefType; to_id: string;
  relation_type: RelationType; directed: boolean; note: string | null; source: RawSource;
}

// Clean graph (committed to src/data/graph.json).
export interface GraphNode {
  key: string;            // `${kind}:${id}`
  name: string;
  kind: NodeRefType;
  subtype: string;        // official: officeType；entity: entity_type
  slug?: string;          // official 才有，可連回檔案頁
  party?: string;         // official
  officeType?: OfficeType;// official
  description?: string;   // entity
}
export interface GraphEdge {
  id: string; source: string; target: string;  // source/target = node key
  type: RelationType; directed: boolean; note: string | null; sourceUrl: string;
}
export interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; }

// Raw rows as returned by Supabase (snake_case). `*_sources` are nested via PostgREST joins.
export interface RawSource { id: string; url: string; type: SourceType; title: string; retrieved_at: string; }
export interface RawOfficial {
  id: string; slug: string; name: string; party: string; office_type: OfficeType; district: string;
  term: string; photo_url: string | null; bio: string; is_incumbent: boolean; departed_reason: string | null;
  careers: { id: string; title: string; organization: string; start_date: string; end_date: string | null; source: RawSource }[];
  judgments: { id: string; case_reason: string; court: string; case_number: string; outcome: string; is_final: boolean; judgment_date: string; judgment_url: string; source: RawSource }[];
  controversies: { id: string; title: string; summary: string; status: ControversyStatus; event_date: string; report_date: string; controversy_sources: { source: RawSource }[] }[];
  asset_declarations: { id: string; year: number; source: RawSource; asset_items: { category: AssetCategory; amount: number; label: string | null }[] }[];
}
