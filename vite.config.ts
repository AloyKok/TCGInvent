import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { handleYuyuteiMarket } from './api/yuyuteiMarketCore';

export default defineConfig({
  base: '/admin/',
  build: {
    outDir: 'dist/admin'
  },
  plugins: [
    {
      name: 'cardpulse-yuyutei-local-api',
      configureServer(server) {
        server.middlewares.use('/api/yuyutei-market', async (request, response) => {
          response.setHeader('Access-Control-Allow-Origin', '*');
          response.setHeader('Access-Control-Allow-Headers', 'content-type');
          response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          if (request.method === 'OPTIONS') {
            response.statusCode = 200;
            response.end();
            return;
          }
          if (request.method !== 'POST') {
            response.statusCode = 405;
            response.end(JSON.stringify({ error: 'method not allowed' }));
            return;
          }
          try {
            const body = await readJsonBody(request);
            const result = await handleYuyuteiMarket(body);
            response.statusCode = result.status;
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify(result.body));
          } catch (error) {
            response.statusCode = 500;
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Yuyutei fetch failed' }));
          }
        });
      }
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'CardPulse Transaction',
        short_name: 'CardPulse',
        description: 'Mobile-first booth inventory and scan-to-sell POS for One Piece TCG sellers.',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/admin/',
        scope: '/admin/',
        icons: [
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/admin/index.html'
      }
    })
  ]
});

function readJsonBody(request: NodeJS.ReadableStream) {
  return new Promise<{ action?: string; cardNumber?: string; sourceUrl?: string }>((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}
