import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { reconcileLabels } from '../reconcile-labels.mjs';

test('reconcileLabels computes create and update sets in dry-run mode', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'webtps-labels-'));
  const manifestPath = path.join(tempDir, 'labels.json');

  await writeFile(
    manifestPath,
    JSON.stringify([
      { name: 'pr:cr', color: '111111', description: 'CR' },
      { name: 'ai:ready', color: '222222', description: 'Ready' },
    ]),
    'utf8'
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/labels\?per_page=100$/);
    assert.equal(options.method, undefined);
    return {
      ok: true,
      async json() {
        return [
          { name: 'pr:cr', color: '999999', description: 'Old' },
        ];
      },
    };
  };

  try {
    const result = await reconcileLabels({
      manifestPath,
      owner: 'example',
      repo: 'WebTPS',
      token: 'token',
      apply: false,
    });

    assert.deepEqual(result, {
      create: ['ai:ready'],
      update: ['pr:cr'],
      apply: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
