import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const rootPath = fileURLToPath(new URL('.', import.meta.url));
const autoRetargetHtmlPath = resolve(rootPath, 'src/miscTools/autoRetarget.html');

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'misc-tools-routes',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const url = request.url?.split('?')[0];

          if (url !== '/miscTools/autoRetarget' && url !== '/miscTools/autoRetarget.html') {
            next();
            return;
          }

          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end(readFileSync(autoRetargetHtmlPath, 'utf8'));
        });
      },
    },
  ],
  server: {
    watch: {
      usePolling: true,
    },
  },
});
