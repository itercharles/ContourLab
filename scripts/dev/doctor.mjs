#!/usr/bin/env node
import { capture, fetchStatus, isPortOpen, printResult, printSection } from './lib.mjs';

async function checkCommand(command, args, label) {
  const result = await capture(command, args);
  printResult(label, result.ok, result.ok ? result.stdout.split('\n')[0] : result.stderr);
  return result.ok;
}

async function main() {
  let ok = true;

  printSection('Commands');
  ok = (await checkCommand('node', ['--version'], 'Node.js')) && ok;
  ok = (await checkCommand('pnpm', ['--version'], 'pnpm')) && ok;
  ok = (await checkCommand('dotnet', ['--version'], '.NET SDK')) && ok;
  ok = (await checkCommand('docker', ['--version'], 'Docker')) && ok;
  ok = (await checkCommand('docker', ['info'], 'Docker daemon')) && ok;

  printSection('Ports');
  const frontendPort = await isPortOpen(3000);
  const apiPort = await isPortOpen(4000);
  const orthancPort = await isPortOpen(8042);
  printResult('Frontend port 3000', frontendPort, frontendPort ? 'listening' : 'not listening');
  printResult('API port 4000', apiPort, apiPort ? 'listening' : 'not listening');
  printResult('Orthanc port 8042', orthancPort, orthancPort ? 'listening' : 'not listening');

  printSection('HTTP');
  const frontend = await fetchStatus('http://127.0.0.1:3000/');
  const api = await fetchStatus('http://127.0.0.1:4000/api/health');
  const orthanc = await fetchStatus('http://127.0.0.1:8042/system');
  printResult('Frontend', frontend.ok, frontend.status ? `HTTP ${frontend.status}` : frontend.error);
  printResult('API health', api.ok, api.status ? `HTTP ${api.status}` : api.error);
  printResult('Orthanc system', orthanc.ok, orthanc.status ? `HTTP ${orthanc.status}` : orthanc.error);

  ok = ok && frontendPort && apiPort && orthancPort && frontend.ok && api.ok && orthanc.ok;

  printSection('DHF');
  const medharnessFound = await capture('medharness', ['--version']);
  if (medharnessFound.ok) {
    ok = (await checkCommand('medharness', ['--dhf', 'DHF', 'doctor'], 'MedHarness DHF')) && ok;
  } else {
    console.log('SKIP MedHarness DHF (not installed — run: pip install -r requirements.txt)');
  }

  printSection('Summary');
  if (ok) {
    console.log('Local ContourLab environment is healthy.');
    console.log('Workspace: http://127.0.0.1:3000/workspace');
    return;
  }

  console.log('Local ContourLab environment has issues.');
  console.log('Try `pnpm local:setup`, then `pnpm local:up`.');
  process.exit(1);
}

main().catch((error) => {
  console.error(`Doctor failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
