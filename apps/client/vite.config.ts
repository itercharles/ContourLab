import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

/**
 * Cornerstone3D codec packages ship IIFE modules (libjpegturbowasm_decode.js etc.)
 * that set a global variable but have no `export default`. The dicom-image-loader
 * decode web worker imports these as ESM and the browser fails with
 * "does not provide an export named 'default'".
 *
 * We glob the pnpm store for all codec decode JS files and append
 * `export default <varName>;` to any that are missing it.
 */
function patchCodecFiles() {
  // pnpm stores packages at node_modules/.pnpm/<scope>+<pkg>@<ver>/node_modules/<scope>/<pkg>/
  // Entry names for codec packages look like: @cornerstonejs+codec-libjpeg-turbo-8bit@1.2.2
  const pnpmDir = resolve(__dirname, '../../node_modules/.pnpm');

  let entries: string[];
  try {
    entries = readdirSync(pnpmDir);
  } catch {
    return; // not a pnpm layout — skip
  }

  for (const entry of entries) {
    // Match entries like "@cornerstonejs+codec-*@*"
    if (!entry.startsWith('@cornerstonejs+codec-')) continue;

    // Strip version suffix: "@cornerstonejs+codec-libjpeg-turbo-8bit@1.2.2" → "codec-libjpeg-turbo-8bit"
    const pkgNameWithVersion = entry.replace('@cornerstonejs+', '');
    const pkgName = pkgNameWithVersion.replace(/@[^@]+$/, ''); // remove @version

    const dist = join(pnpmDir, entry, 'node_modules', '@cornerstonejs', pkgName, 'dist');

    let files: string[];
    try { files = readdirSync(dist); } catch { continue; }

    for (const f of files) {
      if (!f.endsWith('.js')) continue;

      const filePath = join(dist, f);
      const code = readFileSync(filePath, 'utf-8');
      if (code.includes('export default')) continue;

      const match = code.match(/^var\s+(\w+)\s*=/m);
      if (!match) continue;

      writeFileSync(filePath, code + `\nexport default ${match[1]};\n`);
      console.log(`[cornerstone-patch] Patched ${filePath}`);
    }
  }
}

// Patch codec files at build/dev startup
patchCodecFiles();

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    reporters: ['default', './verification-reporter.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
  plugins: [react()],
  worker: {
    format: 'es',
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
    proxy: {
      '/api': `http://localhost:${process.env.CONTOURLAB_API_PORT ?? 4000}`,
      '/debug/client-log': `http://localhost:${process.env.CONTOURLAB_API_PORT ?? 4000}`,
      '/dicom-web': 'http://localhost:8042',
      '/orthanc': 'http://localhost:8042',
      '/ws': {
        target: `ws://localhost:${process.env.CONTOURLAB_API_PORT ?? 4000}`,
        ws: true,
      },
    },
  },
  optimizeDeps: {
    // dicom-image-loader ships its own worker bundle — must not be pre-bundled.
    exclude: ['@cornerstonejs/dicom-image-loader'],
  },
});
