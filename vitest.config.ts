import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every test starts clean: spies, mocks and stubbed globals are undone after each one
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // This forces the output to the root coverage folder
      reportsDirectory: './coverage', 
    },
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],
  },
});
