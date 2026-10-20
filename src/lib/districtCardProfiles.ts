import { loadOfficials } from './data';
import { candidatePhotoCredits } from './candidatePhotos';
import type { Official } from './types';

export interface DistrictCardProfile {
  photoUrl?: string;
  photoCredit?: string;
  service: { label: string; value: string }[];
}

/** 選舉日不等於就職日；缺少結束日期也不代表持續在任。 */
export function councilService(o: Official): DistrictCardProfile['service'] {
  const periods = o.careers.filter(c =>
    /(?:縣|市)(?:議會)?議員$/.test(c.title)
    && !/當選|參選|候選|登記/.test(`${c.title} ${c.organization}`)
    && !/^https:\/\/(?:db|data)\.cec\.gov\.tw\//.test(c.source.url)
    && /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(c.startDate)
    && /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(c.endDate ?? '')
    && c.startDate < c.endDate!,
  );
  if (periods.length) return [...new Map(periods.map(c => [
    `${c.title}:${c.startDate}:${c.endDate}`,
    { label: c.title, value: `${c.startDate} 至 ${c.endDate}` },
  ])).values()];
  const years = [...new Set(o.careers.filter(c =>
    /^https:\/\/(?:db|data)\.cec\.gov\.tw\//.test(c.source.url)
    && /(?:^|\s)當選$/.test(c.title) && /議員（/.test(c.organization)
    && /^\d{4}-\d{2}-\d{2}$/.test(c.startDate),
  ).map(c => c.startDate.slice(0, 4)))].sort();
  return years.length ? [{ label: '議員當選', value: years.join('、') }] : [];
}

let cached: Promise<Map<string, DistrictCardProfile>> | undefined;
export function loadDistrictCardProfiles(): Promise<Map<string, DistrictCardProfile>> {
  return cached ??= loadOfficials().then(officials => {
    const credits = candidatePhotoCredits();
    return new Map(officials.map(o => {
      const credit = credits.get(o.slug);
      return [o.slug, {
        photoUrl: o.photoUrl ?? undefined,
        photoCredit: credit ? `${o.name}：${credit.author}／${credit.license}` : undefined,
        service: councilService(o),
      }];
    }));
  });
}
