#!/usr/bin/env node
import { isPortOpen, printSection, run, spawnService } from './lib.mjs';

async function waitForPort(port, label, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not start on port ${port}.`);
}

async function main() {
  const children = [];

  printSection('DICOM Repository');
  await run('pnpm', ['repo:up']);

  printSection('Auto-Contour Service');
  if (await isPortOpen(4010)) {
    console.log('Auto-contour service already listening on http://127.0.0.1:4010');
  } else {
    children.push(spawnService('autocontour-service', 'pnpm', ['autocontour:service']));
    await waitForPort(4010, 'Auto-contour service');
  }

  printSection('API');
  if (await isPortOpen(4000)) {
    console.log('API already listening on http://127.0.0.1:4000');
  } else {
    children.push(spawnService('api', 'pnpm', ['api']));
    await waitForPort(4000, 'API');
  }

  printSection('Frontend');
  if (await isPortOpen(3000)) {
    console.log('Frontend already listening on http://127.0.0.1:3000');
  } else {
    children.push(spawnService('client', 'pnpm', [
      '--dir',
      'apps/client',
      'exec',
      'vite',
      '--host',
      '127.0.0.1',
      '--port',
      '3000',
    ]));
    await waitForPort(3000, 'Frontend');
  }

  printSection('Ready');
  console.log('Frontend: http://127.0.0.1:3000/workspace');
  console.log('Auto AI:  http://127.0.0.1:4010/health');
  console.log('API:      http://127.0.0.1:4000/api/health');
  console.log('Orthanc:  http://127.0.0.1:8042');
  console.log('DICOMweb: http://127.0.0.1:3000/dicom-web');
  console.log('\nPress Ctrl+C to stop API/frontend started by this command.');
  console.log('Orthanc stays running with persisted data. Use `pnpm local:down` to stop it.');

  const shutdown = () => {
    for (const child of children) {
      if (!child.killed) child.kill('SIGTERM');
    }
    setTimeout(() => process.exit(0), 300);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (children.length === 0) return;
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(`\nStartup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
