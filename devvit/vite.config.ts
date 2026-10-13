import { defineConfig } from 'vite';
import { devvit } from '@devvit/start/vite';

export default defineConfig({
  plugins: [devvit()],
  // Declared inline so Vite stops searching parent directories for a PostCSS
  // config — this app lives in a subfolder of a repo that has its own.
  css: { postcss: { plugins: [] } },
});
