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
  integrations: [svelte(), sitemap()],
});
