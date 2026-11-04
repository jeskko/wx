import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The SPA is served from /wx/app/ with its entry page at the site root (/index.html).
// Data comes from /wx/data/ (baked by the backend). In dev, proxy it to the live site
// or to a local baker output via WX_DATA_ORIGIN.
const dataOrigin = process.env.WX_DATA_ORIGIN ?? 'https://wx.fi';

export default defineConfig({
  base: '/wx/app/',
  plugins: [svelte()],
  build: {
    outDir: 'dist/app',
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
  server: {
    proxy: {
      '/wx/data': { target: dataOrigin, changeOrigin: true },
      '/wx/music': { target: dataOrigin, changeOrigin: true },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
