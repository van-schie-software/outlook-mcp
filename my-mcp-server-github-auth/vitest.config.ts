import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Skip integration tests for now
    exclude: ['**/node_modules/**', '**/index.test.ts'],
  },
  resolve: {
    alias: {
      '@cloudflare/workers-types': 'vitest/globals',
      'cloudflare:workers': 'vitest/globals',
    },
  },
});