import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts'],
    // The rules layer is pure; DOM-dependent tests opt in with a
    // `// @vitest-environment jsdom` docblock at the top of the file.
    environment: 'node',
    globals: false,
    restoreMocks: true,
  },
});
