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
    // dicom-image-loader ships its own worker bundle and should stay out of the
    // optimizer. Its codec decode entrypoints, however, are UMD/CJS modules that
    // Cornerstone imports as default exports, so Vite must pre-bundle those
    // subpaths to normalize interop during local dev.
    include: [
      '@cornerstonejs/codec-charls/decodewasmjs',
      '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
      '@cornerstonejs/codec-openjpeg/decodewasmjs',
      '@cornerstonejs/codec-openjph/wasmjs',
    ],
    exclude: [
      '@cornerstonejs/dicom-image-loader',
    ],
  },
});
