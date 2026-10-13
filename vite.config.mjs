import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rendererRoot = resolve(__dirname, 'src/renderer');

/**
 * Vite configuration for the School Bell System renderer.
 *
 * Output goes to `src/renderer/dist` so that the built bundle travels inside
 * the app.asar archive and can be served by the custom `app://` protocol
 * registered in `src/main/main.js`. A custom (standard) scheme is required
 * because ES modules are blocked by CORS when loaded over `file://`.
 */
export default defineConfig({
  root: rendererRoot,
  // Relative asset URLs so the bundle works under any mount point of app://
  base: './',

  build: {
    outDir: resolve(rendererRoot, 'dist'),
    emptyOutDir: true,
    // Electron 37 ships Chromium 138; this target is safely conservative.
    target: 'chrome130',
    sourcemap: false,
    // Electron does not need the modulepreload polyfill.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: resolve(rendererRoot, 'index.html')
    }
  },

  server: {
    port: 5173,
    strictPort: true
  },

  clearScreen: false
});