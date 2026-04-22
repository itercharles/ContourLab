import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  docNameFromCrId,
  normalizeCrId,
  toBullets,
  validatePlanSpecPayload,
} from './lib/githubAutomation.mjs';

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

function toPlanStatus(value) {
  const allowed = new Set(['draft', 'in_review', 'approved', 'superseded']);
  if (!allowed.has(value)) {
    throw new Error(`Invalid plan status "${value}". Expected one of: ${Array.from(allowed).join(', ')}`);
  }
  return value;
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

function renderSpec({
  crId,
  title,
  status,
  crPrUrl,
  implementationPrUrl,
  problemStatement,
  productFit,
  outOfScope,
  architectureFit,
  adrDecision,
  proposedImplementation,
  affectedRepositories,
  affectedWorkspaces,
  likelyFiles,
  dhfImpact,
  automatedValidation,
  manualValidation,
  acceptanceSignals,
  risks,
  openQuestions,
  implementationExitCriteria,
  completionExitCriteria,
}) {
  return `# ${crId} Spec: ${title}

## Header

- CR ID: \`${crId}\`
- Title: ${title}
- Status: \`${status}\`
- Linked CR PR: ${crPrUrl}
- Linked Implementation PR: ${implementationPrUrl || 'TBD'}

## 1. Problem Statement

${problemStatement}

## 2. Product Fit

${toBullets(productFit, 'TBD')}

Scope explicitly out of bounds:

${toBullets(outOfScope, 'TBD')}

## 3. Architecture Fit

${toBullets(architectureFit, 'TBD')}

ADR:

- ${adrDecision}

## 4. Proposed Implementation

${proposedImplementation}

Affected repositories:

${toBullets(affectedRepositories, 'WebTPS')}

Affected workspaces:

${toBullets(affectedWorkspaces, 'TBD')}

Likely files or modules:

${toBullets(likelyFiles, 'TBD')}

## 5. DHF Impact

${toBullets(dhfImpact, 'No DHF update expected yet; confirm during implementation planning.')}

## 6. Validation Plan

Automated validation:

${toBullets(automatedValidation, 'TBD')}

Manual validation:

${toBullets(manualValidation, 'TBD')}

Acceptance signals:

${toBullets(acceptanceSignals, 'TBD')}

## 7. Risks And Open Questions

Risks:

${toBullets(risks, 'TBD')}

Open questions:

${toBullets(openQuestions, 'None at this time.')}

## 8. Exit Criteria

Before implementation may begin:

${toBullets(implementationExitCriteria, 'Plan Spec PR approved by a human reviewer.')}

Before implementation may be considered complete:

${toBullets(completionExitCriteria, 'Implementation PR approved with required validation and DHF updates addressed.')}
`;
}

async function main() {
  const repoRoot = process.cwd();
  const payloadJson = requireArg('payload');
  const payload = parseJson(payloadJson, 'payload');
  const checkOnly = hasFlag('check');
  const outputDirArg = getArg('output-dir');

  const { crId, title, crPrUrl } = validatePlanSpecPayload(payload);

  const specStatus = toPlanStatus(String(payload.status || 'draft'));
  const specDir = outputDirArg ? path.resolve(repoRoot, outputDirArg) : path.join(repoRoot, 'docs');
  const specPath = path.join(specDir, docNameFromCrId(crId, 'Spec'));
  await mkdir(specDir, { recursive: true });

  const content = renderSpec({
    crId,
    title,
    status: specStatus,
    crPrUrl,
    implementationPrUrl: payload.implementationPrUrl ? String(payload.implementationPrUrl) : '',
    problemStatement: String(
      payload.problemStatement ||
        'TBD. Populate from the approved CR analysis before plan approval.'
    ).trim(),
    productFit: Array.isArray(payload.productFit) ? payload.productFit.map(String) : [],
    outOfScope: Array.isArray(payload.outOfScope) ? payload.outOfScope.map(String) : [],
    architectureFit: Array.isArray(payload.architectureFit) ? payload.architectureFit.map(String) : [],
    adrDecision: String(payload.adrDecision || 'ADR not required yet; confirm during analysis.').trim(),
    proposedImplementation: String(
      payload.proposedImplementation ||
        'TBD. AI analysis should replace this section with the approved implementation approach.'
    ).trim(),
    affectedRepositories: Array.isArray(payload.affectedRepositories)
      ? payload.affectedRepositories.map(String)
      : ['WebTPS'],
    affectedWorkspaces: Array.isArray(payload.affectedWorkspaces)
      ? payload.affectedWorkspaces.map(String)
      : [],
    likelyFiles: Array.isArray(payload.likelyFiles) ? payload.likelyFiles.map(String) : [],
    dhfImpact: Array.isArray(payload.dhfImpact) ? payload.dhfImpact.map(String) : [],
    automatedValidation: Array.isArray(payload.automatedValidation)
      ? payload.automatedValidation.map(String)
      : [],
    manualValidation: Array.isArray(payload.manualValidation) ? payload.manualValidation.map(String) : [],
    acceptanceSignals: Array.isArray(payload.acceptanceSignals) ? payload.acceptanceSignals.map(String) : [],
    risks: Array.isArray(payload.risks) ? payload.risks.map(String) : [],
    openQuestions: Array.isArray(payload.openQuestions) ? payload.openQuestions.map(String) : [],
    implementationExitCriteria: Array.isArray(payload.implementationExitCriteria)
      ? payload.implementationExitCriteria.map(String)
      : [],
    completionExitCriteria: Array.isArray(payload.completionExitCriteria)
      ? payload.completionExitCriteria.map(String)
      : [],
  });

  const previous = await readOptional(specPath);
  if (previous === content) {
    console.log(`No change for ${path.relative(repoRoot, specPath)}`);
    return;
  }

  if (checkOnly) {
    console.log(`Validated payload for ${path.relative(repoRoot, specPath)}`);
    return;
  }

  await writeFile(specPath, content, 'utf8');
  console.log(`Wrote ${path.relative(repoRoot, specPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
