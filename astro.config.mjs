// @ts-check
import { defineConfig } from 'astro/config';

import svelte from '@astrojs/svelte';

// base/site come from the deploy environment so the same build works on a root domain
// (Cloudflare/Netlify/custom domain → BASE_PATH unset) or a GitHub Pages project path
// (BASE_PATH=/<repo>/, set by the deploy workflow).
// https://astro.build/config
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  site: process.env.SITE_URL || undefined,
  integrations: [svelte()],
});
