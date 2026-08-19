import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The repository has a single .env at its root, shared by client and server.
const rootDir = new URL('..', import.meta.url).pathname;

// In development the client calls /api/* on its own origin and Vite proxies
// that to the Express server, so there is no CORS setup and no hard-coded host
// in frontend code. In production VITE_API_BASE_URL points at the API origin.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');

  return {
    plugins: [react()],
    envDir: rootDir,
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://localhost:${env.PORT || 4000}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
