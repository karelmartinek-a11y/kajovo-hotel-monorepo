import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.PLAYWRIGHT_API_PORT
  ? `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT}`
  : 'http://127.0.0.1:8000';

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
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
