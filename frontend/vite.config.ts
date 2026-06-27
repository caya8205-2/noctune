import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import http from 'node:http';
import rootPkg from '../package.json';

const BACKEND_HOST = process.env.VITE_BACKEND_HOST || process.env.BACKEND_HOST || '127.0.0.1';
const PREFERRED_BACKEND_PORT = Number(process.env.VITE_BACKEND_PORT || process.env.PORT || 3131);
const MAX_PORT_ATTEMPTS = Number(process.env.VITE_BACKEND_PORT_ATTEMPTS || 10);
let cachedBackendOrigin: string | null = null;

async function findBackendOrigin(): Promise<string | null> {
  if (cachedBackendOrigin) return cachedBackendOrigin;

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const origin = `http://${BACKEND_HOST}:${PREFERRED_BACKEND_PORT + attempt}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 450);
    try {
      const res = await fetch(`${origin}/status`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (res.ok) {
        cachedBackendOrigin = origin;
        return origin;
      }
    } catch {
      // Try the next fallback port.
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

function backendFallbackProxy() {
  return {
    name: 'noctune-backend-fallback-proxy',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const origin = await findBackendOrigin();
        if (!origin) {
          res.statusCode = 502;
          res.end('No Noctune backend found on the configured port range.');
          return;
        }

        const upstreamPath = req.url?.replace(/^\/api(?=\/|$)/, '') || '/';
        const target = new URL(upstreamPath || '/', origin);
        const proxyReq = http.request(target, {
          method: req.method,
          headers: {
            ...req.headers,
            host: target.host,
          },
        }, (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
          proxyRes.pipe(res);
        });

        proxyReq.on('error', () => {
          cachedBackendOrigin = null;
          res.statusCode = 502;
          res.end('Noctune backend proxy request failed.');
        });

        req.pipe(proxyReq);
      });
    },
  };
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  plugins: [react(), backendFallbackProxy()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  // Tauri expects a fixed port and won't work on random ports
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // Tauri on Windows needs this
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        debug: path.resolve(__dirname, 'debug.html'),
      },
    },
  },
});
