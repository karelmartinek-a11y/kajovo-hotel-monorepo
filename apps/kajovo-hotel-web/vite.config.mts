import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const disableProxy = process.env.VITE_DISABLE_API_PROXY === '1';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: disableProxy
      ? undefined
      : {
          '/api': {
            target: 'http://127.0.0.1:8000',
            changeOrigin: true,
          },
        },
  },
});
