/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Relative base so the build works on any static host or sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), harness: resolve(__dirname, 'harness.html'), popout: resolve(__dirname, 'popout.html') },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/system/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.{ts,tsx}'],
    coverage: { reporter: ['text', 'html'] },
  },
});
