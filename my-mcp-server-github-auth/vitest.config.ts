import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Skip integration tests for now
    exclude: ['**/node_modules/**', '**/index.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'vitest.config.ts',
        'wrangler.toml',
        'src/github-handler.ts', // OAuth handler, not our focus
      ],
    },
  },
  resolve: {
    alias: {
      '@cloudflare/workers-types': 'vitest/globals',
      'cloudflare:workers': 'vitest/globals',
    },
  },
});