import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tst/**/*.test.ts'],
    fuzz: {
      numRuns: 100,
    },
  },
});
