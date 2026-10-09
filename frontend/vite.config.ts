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
        // Per-business SEO files: the backend picks the business from X-Tenant-Host.
        ...Object.fromEntries(
          ['/robots.txt', '/sitemap.xml'].map((path) => [
            path,
            {
              target: backend,
              changeOrigin: true,
              configure: (proxy: { on: (event: 'proxyReq', cb: (req: { setHeader: (k: string, v: string) => void }, incoming: { headers: Record<string, string | string[] | undefined> }) => void) => void }) =>
                proxy.on('proxyReq', (proxyReq, incoming) => proxyReq.setHeader('X-Tenant-Host', String(incoming.headers.host ?? ''))),
            },
          ]),
        ),
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
