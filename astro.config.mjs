// @ts-check
import { defineConfig } from 'astro/config';

import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';

// `site` is the absolute production URL (needed for sitemap + canonical + Open Graph URLs);
// override with SITE_URL for a custom domain. `base` stays root unless deploying to a
// GitHub Pages project subpath (BASE_PATH=/<repo>/).
// https://astro.build/config

export default defineConfig({
  site: process.env.SITE_URL || 'https://legislator-background.pages.dev',
  base: process.env.BASE_PATH || '/',
  // 靜態輸出為 <path>/index.html，Cloudflare Pages 會把 /about 以 308 轉到 /about/。
  // 統一以尾斜線為準（與 canonical、sitemap 一致），讓站內連結不必多跳一次轉址；
  // dev server 也會對缺斜線的網址回 404，漏改的連結在開發時就看得到。
  trailingSlash: 'always',
  integrations: [
    svelte(),
    sitemap({
      filter: (page) => !new URL(page).pathname.endsWith('/elections/2026/policies/'),
      // 人物、政見、學歷、名冊與頁面程式各自更新，快照匯出日不等於每頁修改日。
      // 在有可靠的逐頁更新紀錄前省略可選的 lastmod。
    }),
  ],
});
