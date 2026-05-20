#!/usr/bin/env node
import { capture, printResult, printSection, run } from './lib.mjs';

async function requireCommand(command, args, label) {
  const result = await capture(command, args);
  printResult(label, result.ok, result.ok ? result.stdout.split('\n')[0] : result.stderr);
  if (!result.ok) {
    throw new Error(`${label} is required.`);
  }
}

async function main() {
  printSection('Prerequisites');
  await requireCommand('node', ['--version'], 'Node.js');
  await requireCommand('pnpm', ['--version'], 'pnpm');
  await requireCommand('dotnet', ['--version'], '.NET SDK');
  await requireCommand('docker', ['--version'], 'Docker');

  const dockerInfo = await capture('docker', ['info']);
  printResult('Docker daemon', dockerInfo.ok, dockerInfo.ok ? 'running' : dockerInfo.stderr);
  if (!dockerInfo.ok) {
    throw new Error('Docker daemon is not running. Start Docker Desktop and rerun setup.');
  }

  printSection('Dependencies');
  await run('pnpm', ['install']);
  await run('dotnet', ['restore', 'apps/api/api.csproj']);
  await run('dotnet', ['restore', 'apps/autocontour-service/ContourLab.AutoContourService.csproj']);

  printSection('DICOM Repository');
  await run('pnpm', ['repo:up']);

  printSection('Done');
  console.log('Run `pnpm local:up` to start ContourLab.');
  console.log('Run `pnpm local:doctor` to verify the local environment.');
}

main().catch((error) => {
  console.error(`\nSetup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
