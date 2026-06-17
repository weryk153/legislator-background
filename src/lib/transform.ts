import type { Official, OfficialListRow, RawOfficial, RawSource, Source } from './types';

function toSource(r: RawSource): Source {
  return { id: r.id, url: r.url, type: r.type, title: r.title, retrievedAt: r.retrieved_at };
}

export function toOfficial(r: RawOfficial): Official {
  return {
    id: r.id, name: r.name, party: r.party, officeType: r.office_type, district: r.district,
    term: r.term, photoUrl: r.photo_url, bio: r.bio, isIncumbent: r.is_incumbent,
    careers: r.careers.map((c) => ({
      id: c.id, title: c.title, organization: c.organization,
      startDate: c.start_date, endDate: c.end_date, source: toSource(c.source),
    })),
    judgments: r.judgments.map((j) => ({
      id: j.id, caseReason: j.case_reason, court: j.court, caseNumber: j.case_number,
      outcome: j.outcome, isFinal: j.is_final, judgmentDate: j.judgment_date,
      judgmentUrl: j.judgment_url, source: toSource(j.source),
    })),
    controversies: r.controversies.map((c) => ({
      id: c.id, title: c.title, summary: c.summary, status: c.status,
      eventDate: c.event_date, reportDate: c.report_date,
      sources: c.controversy_sources.map((cs) => toSource(cs.source)),
    })),
    assets: r.asset_declarations.map((a) => ({
      id: a.id, year: a.year, totalAmount: a.total_amount, source: toSource(a.source),
    })),
  };
}

export function toListRow(o: Official): OfficialListRow {
  const latest = o.assets.length
    ? o.assets.reduce((max, a) => (a.year > max.year ? a : max))
    : null;
  return {
    id: o.id, name: o.name, party: o.party, officeType: o.officeType, district: o.district,
    judgmentCount: o.judgments.length,
    controversyCount: o.controversies.length,
    latestAssetTotal: latest ? latest.totalAmount : null,
  };
}
