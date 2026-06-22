import type { Official, OfficialListRow, RawOfficial, RawSource, Source } from './types';

function toSource(r: RawSource): Source {
  // A missing source must survive transform so the validation gate can flag it
  // (`missing source`) instead of crashing with a raw TypeError.
  if (!r) return r as unknown as Source;
  return { id: r.id, url: r.url, type: r.type, title: r.title, retrievedAt: r.retrieved_at };
}

export function toOfficial(r: RawOfficial): Official {
  return {
    id: r.id, slug: r.slug, name: r.name, party: r.party, officeType: r.office_type, district: r.district,
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
      id: a.id, year: a.year, source: toSource(a.source),
      items: (a.asset_items ?? []).map((it) => ({ category: it.category, amount: it.amount, label: it.label })),
    })),
  };
}

export function toListRow(o: Official): OfficialListRow {
  const latest = o.assets.length
    ? o.assets.reduce((max, a) => (a.year > max.year ? a : max))
    : null;
  const latestAssetTotal = latest
    ? latest.items.filter((i) => i.category !== 'debt').reduce((sum, i) => sum + i.amount, 0)
    : null;
  // Pull the 縣市 from the district for the region filter; nationwide/aboriginal/不分區
  // constituencies have no county → grouped as 其他.
  const region = o.district.match(/^(.+?[縣市])/)?.[1] ?? '其他';
  return {
    id: o.id, slug: o.slug, name: o.name, party: o.party, officeType: o.officeType, district: o.district, region,
    judgmentCount: o.judgments.length,
    controversyCount: o.controversies.length,
    latestAssetTotal,
  };
}
