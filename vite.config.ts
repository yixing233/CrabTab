import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api/suggest/bing': {
        target: 'https://api.bing.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/suggest\/bing/, '/osjson.aspx'),
      },
      '/api/suggest/baidu': {
        target: 'https://suggestion.baidu.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/suggest\/baidu/, '/su'),
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        popup: resolve(import.meta.dirname, 'popup.html'),
        sidepanel: resolve(import.meta.dirname, 'sidepanel.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      }
    }
  }
});
