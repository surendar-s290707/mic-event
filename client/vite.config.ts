import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The repository has a single .env at its root, shared by client and server.
const rootDir = new URL('..', import.meta.url).pathname;

// In development the client calls /api/* on its own origin and Vite proxies
// that to the Express server, so there is no CORS setup and no hard-coded host
// in frontend code. In production VITE_API_BASE_URL points at the API origin.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, 'VITE_');

  // Deliberately NOT read from PORT: some dev runners set PORT for the Vite
  // process itself, which would make the proxy point back at this server.
  // 127.0.0.1 rather than localhost, which can resolve to ::1 while the API
  // listens on IPv4.
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:4000';

  return {
    plugins: [react()],
    envDir: rootDir,
    server: {
      port: 5173,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        // ws: true forwards the WebSocket upgrade for live dashboard updates.
        '/socket.io': { target: apiTarget, changeOrigin: true, ws: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
