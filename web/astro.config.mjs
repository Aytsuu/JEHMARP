// @ts-check
import { fileURLToPath } from 'node:url';

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

const transitionVirtualModules = [
  'astro/virtual-modules/transitions.js',
  'astro/virtual-modules/transitions-events.js',
  'astro/virtual-modules/transitions-router.js',
  'astro/virtual-modules/transitions-swap-functions.js',
  'astro/virtual-modules/transitions-types.js',
];

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
  integrations: [react()],
  server: {
    host: "0.0.0.0",
    port: 4321
  },
  vite: {
    plugins: [
      tailwindcss(),
      {
        name: 'jehmarp-optimize-ssr-deps',
        configEnvironment(name) {
          if (name === 'client') {
            return;
          }

          return {
            optimizeDeps: {
              include: [
                ...transitionVirtualModules,
                '@supabase/ssr',
                '@supabase/supabase-js',
                'zod',
              ],
            },
          };
        },
      },
    ],
    optimizeDeps: {
      include: [
        'recharts',
        ...transitionVirtualModules,
      ],
      exclude: ['sharp'],
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    ssr: {
      external: ['sharp'],
    },
  },
  prefetch: {
    defaultStrategy: 'hover',
    prefetchAll: false,
  },
});
