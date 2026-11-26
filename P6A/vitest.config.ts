import { defineConfig } from 'vitest/config';

// Unit and integration tests run in Node: they cover the language-service
// simulator, the LSP wiring and the IF-P6-WS-01 publisher (BroadcastChannel is
// built into Node 22). The browser editor is covered by the system tests in
// docs/test-documentation-P6A.md.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
