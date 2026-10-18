import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Run from the repo root: the provider and its dependencies resolve from the
// monorepo, the scratch Payload runs from this folder's own node_modules.
export default defineConfig({
  plugins: [tsconfigPaths({ root: '../..' })],
  test: {
    root: __dirname,
    include: ['*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
