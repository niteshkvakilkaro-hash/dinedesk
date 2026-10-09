import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_DEV_BACKEND || 'http://127.0.0.1:8000';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      host: true,
      // Tenant sites run on subdomains: haveli.localhost:5173, cafe-sol.localhost:5173 ...
      allowedHosts: ['.localhost', 'localhost', '127.0.0.1'],
      proxy: {
        // The browser's host is forwarded in X-Tenant-Host by the API client,
        // so the proxy can rewrite Host freely.
        '/api': { target: backend, changeOrigin: true },
        '/storage': { target: backend, changeOrigin: true },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
