import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts', 'scraper/test/**/*.test.ts'], environment: 'node' },
});
