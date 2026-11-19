import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// The loading splash lives in src/boot/splash.html (src/lib/startup.ts guards it); it goes into
// index.html at <!--app-splash--> so it paints before any JavaScript. 'pre': %VITE_*% still applies.
const splash = {
  name: 'app-splash',
  transformIndexHtml: {
    order: 'pre' as const,
    // node:fs loaded here, not at the top: a top-level import of it breaks Vitest's runner.
    handler: async (html: string) => {
      const { readFile } = await import('node:fs/promises');
      return html.replace('<!--app-splash-->', await readFile(fileURLToPath(new URL('./src/boot/splash.html', import.meta.url)), 'utf8'));
    },
  },
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_DEV_BACKEND || 'http://127.0.0.1:8000';

  return {
    plugins: [splash, react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // dist/.vite/manifest.json: the site SSR server links a theme's font CSS in the first HTML.
    build: { manifest: true },
    server: {
      port: 5173,
      host: true,
      // Tenant sites run on subdomains: haveli.localhost:5173, cafe-sol.localhost:5173 ...
      // .nip.io: a phone on the same Wi-Fi opens a business site as <slug>.<pc-ip>.nip.io (local Android app).
      allowedHosts: ['.localhost', 'localhost', '127.0.0.1', '.nip.io'],
      proxy: {
        // The browser's host is forwarded in X-Tenant-Host by the API client,
        // so the proxy can rewrite Host freely.
        '/api': { target: backend, changeOrigin: true },
        '/storage': { target: backend, changeOrigin: true },
        // Per-business SEO and app files: the backend picks the business from X-Tenant-Host.
        ...Object.fromEntries(
          ['/robots.txt', '/sitemap.xml', '/site.webmanifest', '/site-icon-'].map((path) => [
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
