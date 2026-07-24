// @ts-check
import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';

import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';

// `site` is the absolute production URL (needed for sitemap + canonical + Open Graph URLs);
// override with SITE_URL for a custom domain. `base` stays root unless deploying to a
// GitHub Pages project subpath (BASE_PATH=/<repo>/).
// https://astro.build/config

// 所有頁面共用同一份資料快照，故以 src/data/meta.json 的 generatedAt 作為 sitemap 的 lastmod
// （比逐頁猜測修改時間更準確：資料何時匯出，頁面就何時「有效更新」）。
let dataGeneratedAt;
try {
  dataGeneratedAt = JSON.parse(readFileSync(new URL('./src/data/meta.json', import.meta.url), 'utf8')).generatedAt;
} catch { /* meta.json optional */ }
const lastmod = dataGeneratedAt ? new Date(dataGeneratedAt) : undefined;

export default defineConfig({
  site: process.env.SITE_URL || 'https://legislator-background.pages.dev',
  base: process.env.BASE_PATH || '/',
  integrations: [
    svelte(),
    sitemap({
      serialize(item) {
        if (lastmod) item.lastmod = lastmod;
        return item;
      },
    }),
  ],
});
