// @ts-check
import { fileURLToPath } from 'node:url';

import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [react()],
  server: {
    host: "0.0.0.0",
    port: 4321
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['recharts'],
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  },
});