import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run tests in a Node.js environment — our tests cover backend (server-side)
    // code that uses Node built-ins like 'path' and 'fs'.
    environment: 'node',

    // Where Vitest looks for test files.
    include: ['src/tests/**/*.test.js'],
  },
});
