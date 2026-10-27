import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadOfficials } from './data';
import { excludedCandidacies, loadCandidacies } from './candidacy';
import { educationForDisplay, loadCandidateEducation } from './candidateEducation';
import { careerText } from './careerCategory';
import { loadCandidatePolicies } from './candidatePolicies';
import { officeRole, shortParty } from './seoTitle';
import { loadDistrictPages } from './districtPageData';
import { candidateSourceLabel } from './candidateTypes';
import { districtAreaSummary } from './districtPage';
import { candidatePhotoCredits } from './candidatePhotos';

export interface ShareCardData {
  id: string;
  kind: 'person' | 'district';
  heading: string;
  subtitle: string;
  detail: string;
  note: string;
  date: string;
  url?: string;
  education?: { text: string; source: string; year: number | null }[];
  careers?: { text: string; source: string }[];
  photoUrl?: string;
  photoCredit?: string;
  electionYears?: number[];
  profileEducation?: { text: string; source: string; year: number | null }[];
  profileCareers?: { text: string; source: string }[];
  assets?: { year: number; source: string; values: { label: string; value: string }[] };
  donations?: { election: string; report: string; source: string; income: number; expense: number; individual?: number; corporate?: number };
}

export const personCardId = (slug: string): string => `person-${createHash('sha256').update(slug).digest('hex').slice(0, 20)}`;
export const districtCardId = (countyKey: string, districtNo: number): string => `district-${countyKey}-${districtNo}`;
export const shareCardPath = (id: string): string => `/og/cards/${id}.png`;
export const portraitCardPath = (id: string): string => `/cards/${id}.png`;
export function hasPortraitContent(card?: ShareCardData): boolean {
  return Boolean(card?.kind === 'person' && (
    (card.profileEducation ?? card.education)?.length || (card.profileCareers ?? card.careers)?.length
    || card.electionYears?.length || card.assets?.values.length || card.donations
  ));
}
let cached: Promise<Map<string, ShareCardData>> | undefined;

export function loadShareCards(): Promise<Map<string, ShareCardData>> {
  return cached ??= buildCards();
}

async function buildCards(): Promise<Map<string, ShareCardData>> {
  const officials = await loadOfficials();
  const candidacies = loadCandidacies();
  const education = loadCandidateEducation(officials);
  const policies = loadCandidatePolicies(officials);
  const photoCredits = candidatePhotoCredits();
  const snapshotDate = JSON.parse(readFileSync(join(process.cwd(), 'src/data/meta.json'), 'utf8')).generatedAt.slice(0, 10);
  const cards = new Map<string, ShareCardData>();
  for (const o of officials) {
    const candidacy = candidacies.get(o.slug);
    const dates = [
      snapshotDate,
      ...education.get(o.slug)?.records.map(r => r.source.retrievedAt) ?? [],
      ...policies.get(o.slug)?.records.map(r => r.reviewedOn) ?? [],
      ...o.assets.map(a => a.source.retrievedAt),
      ...o.donations.map(d => d.source.retrievedAt),
    ];
    const id = personCardId(o.slug);
    const academic = education.get(o.slug);
    const edu = educationForDisplay(academic)[0];
    const seenCareers = new Set<string>();
    const careerRows = o.careers.filter(c => !academic?.excludedCareerIds.includes(c.id)
      && !/2026.*選舉登記參選/.test(c.title)).filter(c => {
        // 同一選區連任紀錄只取名冊原順序第一筆，讓第二筆能呈現不同經歷。
        const key = careerText(c.organization, c.title).replace(/^\d{2,3}年直轄市(?:市)?議員/, '直轄市議員');
        if (seenCareers.has(key)) return false;
        seenCareers.add(key);
        return true;
      });
    const cleanSource = (s: string) => s.replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim();
    const educationRows = edu?.items.map(text => ({ text, source: cleanSource(edu.source.title), year: edu.sourceYear })) ?? [];
    const formatCareer = (c: typeof careerRows[number]) => {
      const election = c.organization.match(/^(\d{2,3})年直轄市(?:市)?議員（(.+)）$/);
      return {
        text: election && c.title.endsWith(' 當選')
          ? `${Number(election[1]) + 1911} 年當選${election[2]}議員（${c.title.replace(/ 當選$/, '')}）`
          : `${careerText(c.organization, c.title)}${c.startDate ? `（${c.startDate}${c.endDate ? ` 至 ${c.endDate}` : ' 紀錄'}）` : ''}`,
        source: cleanSource(c.source.title),
      };
    };
    const profileCareers = careerRows.filter(c =>
      !/^https:\/\/db\.cec\.gov\.tw\//.test(c.source.url)
      && !/候選人登記名冊|選舉登記參選/.test(`${c.organization} ${c.title}`),
    ).sort((a, b) => Number(a.title === '委員' && /委員會$/.test(a.organization)) - Number(b.title === '委員' && /委員會$/.test(b.organization)));
    const asset = [...o.assets].sort((a, b) => b.year - a.year)[0];
    const assetValues = ([
      ['deposit', '存款（元）'], ['securities', '有價證券（元）'], ['debt', '債務（元）'],
      ['land', '土地（筆）'], ['building', '建物（筆）'],
    ] as const).flatMap(([category, label]) => {
      const rows = asset?.items.filter(i => i.category === category && Number.isFinite(i.amount) && i.amount >= 0
        && ((category === 'land' || category === 'building') ? i.label === 'count' : i.label !== 'count')) ?? [];
      return rows.length ? [{ label, value: new Intl.NumberFormat('zh-TW').format(rows.reduce((sum, row) => sum + row.amount, 0)) }] : [];
    }).slice(0, 4);
    const donation = o.donations[0];
    const origin = (process.env.SITE_URL || 'https://legislator-background.pages.dev').replace(/\/$/, '');
    cards.set(id, {
      id, kind: 'person', heading: o.name,
      subtitle: candidacy ? `2026 ${candidacy.role}候選人${candidacy.number != null ? `・${candidacy.number} 號` : ''}` : excludedCandidacies().has(o.slug) && o.officeType === 'candidate' ? '2026 登記參選・未通過資格審查' : officeRole(o.officeType, o.district),
      detail: `${shortParty(o.party)}${candidacy ? '' : `・${o.district}`}`,
      note: o.departedReason ? '已非現任・任內公開資料與來源' : '學經歷與公開紀錄・逐筆附出處',
      date: dates.sort().at(-1)!,
      url: `${origin}/officials/${o.slug}/`,
      photoUrl: o.photoUrl ?? undefined,
      photoCredit: photoCredits.has(o.slug)
        ? `${photoCredits.get(o.slug)!.author}／${photoCredits.get(o.slug)!.license}（原圖連結見人物頁）`
        : undefined,
      electionYears: [...new Set(o.careers.filter(c =>
        /^https:\/\/db\.cec\.gov\.tw\//.test(c.source.url)
        && /(?:^|\s)當選$/.test(c.title)
        && /^\d{4}-\d{2}-\d{2}$/.test(c.startDate ?? ''),
      ).map(c => Number(c.startDate!.slice(0, 4))))].sort((a, b) => a - b),
      education: educationRows.slice(0, 2),
      careers: careerRows.slice(0, 2).map(formatCareer),
      profileEducation: educationRows,
      profileCareers: profileCareers.map(formatCareer),
      assets: asset && assetValues.length ? { year: asset.year, source: cleanSource(asset.source.title), values: assetValues } : undefined,
      donations: donation ? {
        election: donation.electionName, report: donation.reportSeq, source: cleanSource(donation.source.title),
        income: donation.totalIncome, expense: donation.totalExpense,
        individual: donation.incomeByType['個人捐贈收入'], corporate: donation.incomeByType['營利事業捐贈收入'],
      } : undefined,
    });
  }
  for (const page of loadDistrictPages()) {
    const id = districtCardId(page.county.key, page.district.no);
    cards.set(id, {
      id, kind: 'district', heading: `${page.county.name}${page.district.label}`,
      subtitle: `2026 議員候選人・共 ${page.district.candidates.length} 人`,
      detail: districtAreaSummary(page.area),
      note: candidateSourceLabel(page.district.source ?? page.council.source),
      date: (page.district.source ?? page.council.source).tableDate,
    });
  }
  return cards;
}
