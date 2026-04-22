import { readFile } from 'node:fs/promises';
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

async function readManifest(manifestPath) {
  const content = await readFile(manifestPath, 'utf8');
  const labels = JSON.parse(content);
  if (!Array.isArray(labels)) {
    throw new Error('Label manifest must be an array');
  }
  return labels;
}

function toMap(labels) {
  return new Map(labels.map((label) => [label.name, label]));
}

function diffLabels(manifestLabels, existingLabels) {
  const manifestMap = toMap(manifestLabels);
  const existingMap = toMap(existingLabels);

  const create = [];
  const update = [];

  for (const [name, desired] of manifestMap.entries()) {
    const current = existingMap.get(name);
    if (!current) {
      create.push(desired);
      continue;
    }

    if (current.color !== desired.color || current.description !== desired.description) {
      update.push({ current, desired });
    }
  }

  return { create, update };
}

export async function reconcileLabels({ manifestPath, owner, repo, token, apply }) {
  const manifestLabels = await readManifest(manifestPath);

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const existingResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/labels?per_page=100`, {
    headers,
  });

  if (!existingResponse.ok) {
    throw new Error(`Failed to list labels: ${existingResponse.status} ${existingResponse.statusText}`);
  }

  const existingLabels = await existingResponse.json();
  const diff = diffLabels(manifestLabels, existingLabels);

  if (apply) {
    for (const label of diff.create) {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/labels`, {
        method: 'POST',
        headers,
        body: JSON.stringify(label),
      });
      if (!response.ok) {
        throw new Error(`Failed to create label "${label.name}": ${response.status} ${response.statusText}`);
      }
    }

    for (const { current, desired } of diff.update) {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/labels/${encodeURIComponent(current.name)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          new_name: desired.name,
          color: desired.color,
          description: desired.description,
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to update label "${current.name}": ${response.status} ${response.statusText}`);
      }
    }
  }

  return {
    create: diff.create.map((label) => label.name),
    update: diff.update.map(({ desired }) => desired.name),
    apply,
  };
}

async function main() {
  const repoRoot = process.cwd();
  const owner = requireArg('owner');
  const repo = requireArg('repo');
  const token = requireArg('token');
  const apply = hasFlag('apply');
  const manifestPath = path.resolve(repoRoot, getArg('manifest') || '.github/labels.json');

  const result = await reconcileLabels({
    manifestPath,
    owner,
    repo,
    token,
    apply,
  });

  console.log(JSON.stringify(result, null, 2));
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
