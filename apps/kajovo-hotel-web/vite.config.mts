import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const disableProxy = process.env.VITE_DISABLE_API_PROXY === '1';
const skipEmptyOutDir = process.env.VITE_SKIP_EMPTY_OUT_DIR === '1';
const skipLockedDownloads = process.env.VITE_SKIP_LOCKED_DOWNLOADS === '1';
const apiTarget = process.env.PLAYWRIGHT_API_PORT
  ? `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT}`
  : 'http://127.0.0.1:8000';

function resolvePlaywrightPublicDir(): string {
  if (!skipLockedDownloads) {
    return 'public';
  }

  fs.mkdirSync(path.resolve('.tmp'), { recursive: true });
  const tempDir = fs.mkdtempSync(path.resolve('.tmp', 'kajovo-hotel-web-public-'));
  const sourceDir = path.resolve('public');
  fs.cpSync(sourceDir, tempDir, {
    recursive: true,
    filter: (entry) => !entry.endsWith(`${path.sep}kajovo-hotel-android.apk`),
  });
  return tempDir;
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  build: {
    emptyOutDir: !skipEmptyOutDir,
  },
  publicDir: command === 'build' ? resolvePlaywrightPublicDir() : 'public',
  server: {
    port: 5173,
    proxy: disableProxy
      ? undefined
      : {
          '/api': {
            target: apiTarget,
            changeOrigin: true,
          },
        },
  },
}));
