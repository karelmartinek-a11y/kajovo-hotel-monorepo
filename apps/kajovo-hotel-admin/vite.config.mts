import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.PLAYWRIGHT_API_PORT
  ? `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT}`
  : 'http://127.0.0.1:8000';

export default defineConfig({
  base: '/admin/',
  plugins: [react(), {
    name: 'root-brand-assets',
    configureServer(server) {
      // Production serves brand assets at the domain root, outside /admin/.
      server.middlewares.use((req, _res, next) => {
        if (req.url?.startsWith('/brand/')) req.url = `/admin${req.url}`;
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url?.startsWith('/brand/')) req.url = `/admin${req.url}`;
        next();
      });
    },
  }],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
