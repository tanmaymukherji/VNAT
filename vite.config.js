import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: '/VNAT/',
  publicDir: 'public',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api/askgre': {
        target: 'https://askgre.grameee.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/askgre/, '/api/chat'),
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
