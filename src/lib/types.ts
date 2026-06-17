export type OfficeType = 'legislator' | 'mayor_magistrate' | 'councilor';
export type ControversyStatus =
  | 'investigating' | 'indicted' | 'first_instance' | 'settled' | 'cleared' | 'other';
export type SourceType = 'court' | 'news' | 'gov' | 'gazette' | 'factcheck';

export interface Source { id: string; url: string; type: SourceType; title: string; retrievedAt: string; }
export interface Career { id: string; title: string; organization: string; startDate: string; endDate: string | null; source: Source; }
export interface Judgment { id: string; caseReason: string; court: string; caseNumber: string; outcome: string; isFinal: boolean; judgmentDate: string; judgmentUrl: string; source: Source; }
export interface Controversy { id: string; title: string; summary: string; status: ControversyStatus; eventDate: string; reportDate: string; sources: Source[]; }
export type AssetCategory =
  | 'land' | 'building' | 'cash' | 'deposit' | 'securities' | 'investment' | 'claim' | 'debt' | 'other';
export interface AssetItem { category: AssetCategory; amount: number; label: string | null; }
export interface AssetDeclaration { id: string; year: number; items: AssetItem[]; source: Source; }

export interface Official {
  id: string; name: string; party: string; officeType: OfficeType; district: string;
  term: string; photoUrl: string | null; bio: string; isIncumbent: boolean;
  careers: Career[]; judgments: Judgment[]; controversies: Controversy[]; assets: AssetDeclaration[];
}

export interface OfficialListRow {
  id: string; name: string; party: string; officeType: OfficeType; district: string;
  judgmentCount: number; controversyCount: number; latestAssetTotal: number | null;
}

// Raw rows as returned by Supabase (snake_case). `*_sources` are nested via PostgREST joins.
export interface RawSource { id: string; url: string; type: SourceType; title: string; retrieved_at: string; }
export interface RawOfficial {
  id: string; name: string; party: string; office_type: OfficeType; district: string;
  term: string; photo_url: string | null; bio: string; is_incumbent: boolean;
  careers: { id: string; title: string; organization: string; start_date: string; end_date: string | null; source: RawSource }[];
  judgments: { id: string; case_reason: string; court: string; case_number: string; outcome: string; is_final: boolean; judgment_date: string; judgment_url: string; source: RawSource }[];
  controversies: { id: string; title: string; summary: string; status: ControversyStatus; event_date: string; report_date: string; controversy_sources: { source: RawSource }[] }[];
  asset_declarations: { id: string; year: number; source: RawSource; asset_items: { category: AssetCategory; amount: number; label: string | null }[] }[];
}
