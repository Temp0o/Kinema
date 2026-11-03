import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      // The dev server injects an inline React-refresh preamble, which the strict (production) CSP
      // in index.html blocks. Relax script-src for `vite` / `vite dev` only.
      name: 'kinema-dev-csp',
      apply: 'serve',
      transformIndexHtml: (html: string) => html.replace("script-src 'self' blob:", "script-src 'self' 'unsafe-inline' blob:"),
    },
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    target: 'chrome130',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/unit/**/*.test.ts'],
  },
} as any);
