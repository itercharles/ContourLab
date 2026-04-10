import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  plugins: [react()],
  server: {
    port: 3000,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
    proxy: {
      '/api': 'http://localhost:4000',
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
      },
    },
  },
  optimizeDeps: {
    // dicom-image-loader ships its own worker bundle — must not be pre-bundled.
    // Codec packages are WASM/CJS with no default export and must load as-is at runtime.
    // core and tools must remain in the pre-bundler so Vite converts their CJS deps
    // (e.g. globalthis) to ESM correctly.
    exclude: [
      '@cornerstonejs/dicom-image-loader',
      '@cornerstonejs/codec-charls',
      '@cornerstonejs/codec-libjpeg-turbo-8bit',
      '@cornerstonejs/codec-libjpeg-turbo-12bit',
      '@cornerstonejs/codec-openjpeg',
      '@cornerstonejs/codec-openjph',
    ],
  },
});
