// 檢查建置後的真實 HTML，確保互動介面調整不會移除可索引內容。
// 執行：pnpm build && pnpm audit:seo
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'node-html-parser';

const dist = join(process.cwd(), 'dist');
if (!existsSync(dist)) throw new Error('請先執行 pnpm build');
const errors: string[] = [];
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    // 網域驗證用的 google*.html 不是內容頁，不做標題／索引檢查。
    return entry.isDirectory() ? walk(path) : /^(index|404)\.html$/.test(entry.name) ? [path] : [];
  });
}
const normalized = (href: string) => new URL(href).href;
const locations = (xml: string) => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => normalized(m[1]));
const sitemapFiles = readdirSync(dist).filter(name => /^sitemap-\d+\.xml$/.test(name));
if (!sitemapFiles.length) errors.push('缺少 sitemap');
const sitemap = new Set(sitemapFiles.flatMap(name => locations(readFileSync(join(dist, name), 'utf8'))));
const indexed = new Set<string>();
const titles = new Map<string, string>();
let excluded = 0;
let structured = 0;
for (const file of walk(dist)) {
  const route = '/' + relative(dist, file).replace(/index\.html$/, '');
  const root = parse(readFileSync(file, 'utf8'));
  const fail = (reason: string) => errors.push(`${route}：${reason}`);
  if (root.querySelector('meta[name="robots"]')?.getAttribute('content')?.includes('noindex')) {
    excluded++;
    if ([...sitemap].some(href => decodeURI(new URL(href).pathname) === route)) fail('noindex 頁出現在 sitemap');
    continue;
  }
  const title = root.querySelector('title')?.textContent.trim();
  if (!title) fail('缺少 title');
  else {
    if (titles.has(title)) fail(`與 ${titles.get(title)} 重複 title`);
    titles.set(title, route);
  }
  if (!root.querySelector('meta[name="description"]')?.getAttribute('content')?.trim()) fail('缺少 description');
  if (root.querySelectorAll('h1').length !== 1) fail('應有且僅有一個靜態 h1');
  if (root.querySelectorAll('link[rel="canonical"]').length !== 1) fail('應有且僅有一個 canonical');
  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute('href');
  try {
    const url = new URL(canonical ?? '');
    if (url.protocol !== 'https:' || url.search || url.hash || url.hostname === 'localhost') fail('canonical 不是乾淨的正式 HTTPS 網址');
    if (decodeURI(url.pathname) !== route) fail('canonical 與頁面路徑不同');
    if (!sitemap.has(url.href)) fail('canonical 未列入 sitemap');
    indexed.add(url.href);
    if (root.querySelector('meta[property="og:url"]')?.getAttribute('content') !== canonical) fail('og:url 與 canonical 不同');
    const image = new URL(root.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '');
    if (image.origin === url.origin && !existsSync(join(dist, decodeURIComponent(image.pathname)))) fail('分享圖片檔案不存在');
  } catch { fail('canonical 或 og:image 缺漏／網址無效'); }
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const value = JSON.parse(script.textContent);
      for (const item of Array.isArray(value) ? value : [value]) {
        if (!item['@context'] || !item['@type']) fail('結構化資料缺少 context/type');
        if (typeof item.license === 'string' && !/^https?:\/\//.test(item.license)) fail('license 必須指向授權頁，不可填入來源說明');
      }
      structured++;
    } catch { fail('JSON-LD 不是有效 JSON'); }
  }
  // 人物與各地名冊不能只留在 JavaScript 資料中。
  if (/^\/officials\//.test(route) && !root.querySelector('#careers')) fail('缺少靜態人物經歷區');
  if (/^\/elections\/2026\/[^/]+\/$/.test(route) && !root.querySelector('#chief-title')) fail('缺少靜態縣市候選人區');
  if (/^\/elections\/2026\/[^/]+\/district-\d+\/$/.test(route) && !root.querySelector('.candidates h3')) fail('缺少靜態選區候選人');
}
for (const url of sitemap) if (!indexed.has(url)) errors.push(`sitemap 指向未通過索引頁清單的網址：${url}`);
const robots = readFileSync(join(dist, 'robots.txt'), 'utf8');
const indexes = locations(readFileSync(join(dist, 'sitemap-index.xml'), 'utf8'));
const home = [...indexed].find(href => new URL(href).pathname === '/');
if (home) {
  const expected = new URL('/sitemap-index.xml', home).href;
  if (!robots.includes(`Sitemap: ${expected}`)) errors.push('robots sitemap 網域與 canonical 不一致');
  if (indexes.some(href => new URL(href).origin !== new URL(home).origin)) errors.push('sitemap index 網域與 canonical 不一致');
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`SEO 檢查通過：${indexed.size} 個索引頁、${excluded} 個排除頁、${structured} 段 JSON-LD；標題、摘要、H1、canonical、分享圖片、靜態內容與 sitemap 一致。`);
}
