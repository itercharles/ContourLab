import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function getArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function requireArg(name) {
  const value = getArg(name);
  if (!value) {
    throw new Error(`Missing required argument --${name}`);
  }
  return value;
}

function parseJson(value, name) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON for --${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeCrId(raw) {
  const value = raw.trim().toUpperCase();
  if (!/^CR-\d+$/.test(value)) {
    throw new Error(`Invalid CR id "${raw}". Expected format CR-123`);
  }
  return value;
}

function toBullets(items, emptyText) {
  if (!items.length) {
    return `- ${emptyText}`;
  }
  return items.map((item) => `- ${item}`).join('\n');
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function renderImplementationKickoff({
  crId,
  title,
  crPrUrl,
  planPrUrl,
  planSpecPath,
  status,
  expectedDhfImpact,
  automatedValidation,
  manualValidation,
  initialWorkstreams,
  openItems,
}) {
  return `# ${crId} Implementation Kickoff: ${title}

## Header

- CR ID: \`${crId}\`
- Status: \`${status}\`
- Linked CR PR: ${crPrUrl}
- Linked Plan Spec PR: ${planPrUrl}
- Plan Spec: \`${planSpecPath}\`

## Purpose

This document tracks the implementation kickoff for ${crId}. It exists to
create an implementation review surface before the full code and DHF changes
land on the implementation branch.

## Expected DHF Impact

${toBullets(expectedDhfImpact, 'Confirm DHF changes during implementation.')}

## Initial Workstreams

${toBullets(initialWorkstreams, 'TBD')}

## Automated Validation Target

${toBullets(automatedValidation, 'TBD')}

## Manual Validation Target

${toBullets(manualValidation, 'TBD')}

## Open Items

${toBullets(openItems, 'No open items recorded yet.')}
`;
}

async function main() {
  const repoRoot = process.cwd();
  const payload = parseJson(requireArg('payload'), 'payload');
  const checkOnly = hasFlag('check');
  const outputDirArg = getArg('output-dir');

  const crId = normalizeCrId(payload.crId);
  const title = String(payload.title || '').trim();
  const crPrUrl = String(payload.crPrUrl || '').trim();
  const planPrUrl = String(payload.planPrUrl || '').trim();

  if (!title) throw new Error('Payload field "title" is required');
  if (!crPrUrl) throw new Error('Payload field "crPrUrl" is required');
  if (!planPrUrl) throw new Error('Payload field "planPrUrl" is required');

  const docDir = outputDirArg ? path.resolve(repoRoot, outputDirArg) : path.join(repoRoot, 'docs');
  const docPath = path.join(docDir, `${crId.replace('-', '')}-Implementation.md`);
  await mkdir(docDir, { recursive: true });

  const content = renderImplementationKickoff({
    crId,
    title,
    crPrUrl,
    planPrUrl,
    planSpecPath: String(payload.planSpecPath || `docs/${crId.replace('-', '')}-Spec.md`),
    status: String(payload.status || 'draft'),
    expectedDhfImpact: Array.isArray(payload.expectedDhfImpact) ? payload.expectedDhfImpact.map(String) : [],
    automatedValidation: Array.isArray(payload.automatedValidation) ? payload.automatedValidation.map(String) : [],
    manualValidation: Array.isArray(payload.manualValidation) ? payload.manualValidation.map(String) : [],
    initialWorkstreams: Array.isArray(payload.initialWorkstreams) ? payload.initialWorkstreams.map(String) : [],
    openItems: Array.isArray(payload.openItems) ? payload.openItems.map(String) : [],
  });

  const previous = await readOptional(docPath);
  if (previous === content) {
    console.log(`No change for ${path.relative(repoRoot, docPath)}`);
    return;
  }

  if (checkOnly) {
    console.log(`Validated payload for ${path.relative(repoRoot, docPath)}`);
    return;
  }

  await writeFile(docPath, content, 'utf8');
  console.log(`Wrote ${path.relative(repoRoot, docPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
