import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

const packageJsonPath = fileURLToPath(new URL('./package.json', import.meta.url));
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
const builtAt = new Date().toISOString();
const releaseVersion = process.env.RENDER_GIT_COMMIT ||
  process.env.VITE_RELEASE_VERSION ||
  `${packageJson.version || 'dev'}-${builtAt}`;

const versionPayload = JSON.stringify({
  version: releaseVersion,
  builtAt,
}, null, 2);

function releaseVersionPlugin(): Plugin {
  return {
    name: 'release-version',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.end(versionPayload);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: versionPayload,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), releaseVersionPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    __APP_RELEASE__: JSON.stringify(releaseVersion),
  },
  server: {
    port: 3607,
    proxy: {
      '/api': {
        target: 'http://localhost:4607',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
