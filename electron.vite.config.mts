import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const alias = { '@shared': resolve(import.meta.dirname, 'src/shared') };

export default defineConfig({
  main: {
    resolve: { alias },
  },
  preload: {
    resolve: { alias },
    build: {
      rolldownOptions: {
        input: {
          ui: resolve(import.meta.dirname, 'src/preload/ui.ts'),
          yt: resolve(import.meta.dirname, 'src/preload/yt.ts'),
        },
      },
    },
  },
  renderer: {
    resolve: { alias },
    plugins: [react()],
  },
});
