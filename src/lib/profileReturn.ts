/** 只沿已知的站內列表返回，避免把站外來源或另一個個人頁誤當返回目的地。 */
export function profileReturn(referrer: string, origin: string): { href: string; label: string } | null {
  try {
    const url = new URL(referrer);
    if (url.origin !== origin) return null;
    const label = url.pathname === '/elections/' ? '返回候選人清單'
      : /^\/elections\/2026\/[a-z-]+\/$/.test(url.pathname) ? '返回縣市名單'
      : url.pathname === '/donors/' ? '返回政治獻金查詢'
      : ['/graph/', '/graph/connect/'].includes(url.pathname) ? '返回人物關係'
      : url.pathname === '/' ? '返回總覽' : null;
    const hash = url.hash || (url.pathname === '/elections/' ? '#finder-title' : '');
    return label ? { href: `${url.pathname}${url.search}${hash}`, label: `← ${label}` } : null;
  } catch { return null; }
}
