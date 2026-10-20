import { readComparisonTopic } from './candidateComparison';
import { countyByKey } from './countyKeys';
import { chiefPolicyUrl } from './chiefPolicyComparison';

/** 保留查詢狀態，但分享連結固定使用正式網域，避免傳出本機網址或追蹤參數。 */
export function pageShareUrl(canonical: string, current?: string): string {
  const url = new URL(canonical);
  if (current) {
    const state = new URL(current);
    if (state.pathname === url.pathname) {
      const county = countyByKey(url.pathname.match(/^\/elections\/2026\/([a-z-]+)\/$/)?.[1] ?? '');
      if (county && (state.searchParams.get('left') || state.searchParams.get('right'))) {
        const left = state.searchParams.get('left') ?? '';
        const right = state.searchParams.get('right') ?? '';
        return chiefPolicyUrl(url.href, { county: county.key, left, right, q: state.searchParams.get('q') ?? '' })
          + (left && right && left !== right ? '#policy-comparison' : '#chief-title');
      }
      const keys = url.pathname === '/elections/' ? ['county', 'office', 'district', 'q', 'shown']
        : url.pathname === '/graph/connect/' ? ['from', 'to'] : [];
      for (const key of keys) {
        const value = state.searchParams.get(key);
        if (value) url.searchParams.set(key, value);
      }
      if (keys.length && state.hash) url.hash = state.hash;
      if (/^\/elections\/2026\/[a-z-]+\/district-\d+\/$/.test(url.pathname)) {
        url.searchParams.delete('compare');
        const people = [...new Set(state.searchParams.getAll('compare').filter(Boolean))].slice(0, 4);
        people.forEach(id => url.searchParams.append('compare', id));
        url.searchParams.delete('topic');
        const topic = readComparisonTopic(state.search);
        if (people.length >= 2 && topic !== 'education') url.searchParams.set('topic', topic);
        if (people.length) url.hash = people.length >= 2 ? 'comparison-results' : 'compare';
      }
    }
  }
  return url.href;
}
