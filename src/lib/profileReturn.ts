import { countyByKey } from './countyKeys';

/** 只沿已知的站內列表返回，避免把站外來源或另一個個人頁誤當返回目的地。 */
export function profileReturn(referrer: string, origin: string): { href: string; label: string } | null {
  try {
    const url = new URL(referrer);
    if (url.origin !== origin) return null;
    const county = countyByKey(url.pathname.match(/^\/elections\/2026\/([a-z-]+)\/$/)?.[1] ?? '');
    const chiefComparison = (county || url.pathname === '/elections/2026/policies/')
      && url.searchParams.get('left') && url.searchParams.get('right')
      && url.searchParams.get('left') !== url.searchParams.get('right');
    const label = url.pathname === '/elections/' ? '返回候選人清單'
      : chiefComparison || url.pathname === '/elections/2026/policies/' ? '返回政見比較'
      : /^\/elections\/2026\/[a-z-]+\/district-[1-9]\d*\/$/.test(url.pathname) ? '返回選區名單'
      : county ? '返回縣市名單'
      : url.pathname === '/donors/' ? '返回政治獻金查詢'
      : ['/graph/', '/graph/connect/'].includes(url.pathname) ? '返回人物關係'
      : url.pathname === '/' ? '返回總覽' : null;
    const hash = chiefComparison ? '#policy-comparison' : url.hash || (url.pathname === '/elections/' ? '#finder-title' : '');
    return label ? { href: `${url.pathname}${url.search}${hash}`, label: `← ${label}` } : null;
  } catch { return null; }
}
