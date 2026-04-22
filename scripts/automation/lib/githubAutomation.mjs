export function normalizeCrId(raw) {
  const value = String(raw || '').trim().toUpperCase();
  if (!/^CR-\d+$/.test(value)) {
    throw new Error(`Invalid CR id "${raw}". Expected format CR-123`);
  }
  return value;
}

export function crNumberFromId(crId) {
  return normalizeCrId(crId).split('-')[1];
}

export function docNameFromCrId(crId, suffix) {
  return `${normalizeCrId(crId).replace('-', '')}-${suffix}.md`;
}

export function toBullets(items, emptyText) {
  if (!items.length) {
    return `- ${emptyText}`;
  }
  return items.map((item) => `- ${item}`).join('\n');
}

export function latestReviewStatesByUser(reviews) {
  const states = new Map();
  for (const review of reviews) {
    const login = review?.user?.login;
    if (!login) continue;
    states.set(login, review.state);
  }
  return states;
}

export function activeApprovedUsers(reviews) {
  return Array.from(latestReviewStatesByUser(reviews).entries())
    .filter(([, state]) => state === 'APPROVED')
    .map(([login]) => login);
}

export function hasAuthorizedApproval(reviews, authorizedApprovers) {
  const allowlist = (authorizedApprovers || []).map((value) => String(value).trim()).filter(Boolean);
  if (!allowlist.length) {
    return false;
  }
  return activeApprovedUsers(reviews).some((login) => allowlist.includes(login));
}

export function parseCsvList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function globToRegex(pattern) {
  let result = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === '*' && next === '*') {
      result += '.*';
      index += 1;
      continue;
    }
    if (char === '*') {
      result += '[^/]*';
      continue;
    }
    result += escapeRegex(char);
  }
  return new RegExp(`^${result}$`);
}

export function parseCodeowners(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [pattern, ...owners] = line.split(/\s+/);
      return {
        pattern,
        owners,
      };
    })
    .filter((entry) => entry.pattern && entry.owners.length);
}

export function resolveCodeownerOwnersForFiles(codeownersText, changedFiles) {
  const entries = parseCodeowners(codeownersText);
  const owners = new Set();

  for (const filePath of changedFiles || []) {
    let matchedOwners = [];
    for (const entry of entries) {
      const normalizedPattern = entry.pattern.startsWith('/')
        ? entry.pattern.slice(1)
        : entry.pattern;
      if (globToRegex(normalizedPattern).test(filePath)) {
        matchedOwners = entry.owners;
      }
    }
    for (const owner of matchedOwners) {
      owners.add(owner);
    }
  }

  return Array.from(owners);
}

export function extractCodeownerUsers(owners) {
  return owners
    .filter((owner) => owner.startsWith('@') && !owner.includes('/'))
    .map((owner) => owner.slice(1));
}

export function extractCodeownerTeams(owners) {
  return owners
    .filter((owner) => owner.startsWith('@') && owner.includes('/'))
    .map((owner) => owner.slice(1));
}

export function evaluateReviewerAuthorization({
  reviews = [],
  authorizedApprovers = [],
  authorizedTeams = [],
  teamMembersByTeam = {},
  requireCodeownerApproval = false,
  codeownerUsers = [],
  codeownerTeams = [],
}) {
  const activeApprovals = activeApprovedUsers(reviews);
  const allowlist = parseCsvList(authorizedApprovers);
  const teamList = parseCsvList(authorizedTeams);
  const normalizedTeamMembers = Object.fromEntries(
    Object.entries(teamMembersByTeam || {}).map(([team, members]) => [team, parseCsvList(members)])
  );
  const requiredCodeownerUsers = parseCsvList(codeownerUsers);
  const requiredCodeownerTeams = parseCsvList(codeownerTeams);

  const authorizedByAllowlist = activeApprovals.filter((login) => allowlist.includes(login));
  const authorizedByTeams = activeApprovals.filter((login) =>
    teamList.some((team) => (normalizedTeamMembers[team] || []).includes(login))
  );
  const authorizedByCodeowners = activeApprovals.filter((login) => {
    if (requiredCodeownerUsers.includes(login)) {
      return true;
    }
    return requiredCodeownerTeams.some((team) => (normalizedTeamMembers[team] || []).includes(login));
  });

  const baseAuthorized = teamList.length ? authorizedByTeams : authorizedByAllowlist;
  const hasBaseAuthorization = baseAuthorized.length > 0;
  const hasCodeownerAuthorization = requireCodeownerApproval
    ? authorizedByCodeowners.length > 0
    : true;

  return {
    activeApprovals,
    authorizedByAllowlist,
    authorizedByTeams,
    authorizedByCodeowners,
    hasBaseAuthorization,
    hasCodeownerAuthorization,
    hasAuthorizedApproval: hasBaseAuthorization && hasCodeownerAuthorization,
  };
}

export function isHumanUser(user) {
  return !user?.type || user.type !== 'Bot';
}

export function countHumanComments(comments) {
  return comments.filter((comment) => isHumanUser(comment.user)).length;
}

export function extractLinkedCrPr(body) {
  const match = String(body || '').match(/CR PR:\s+(https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+))/i);
  if (!match) {
    return null;
  }

  const [, url, owner, repo, pullNumber] = match;
  return {
    url,
    owner,
    repo,
    pullNumber: Number(pullNumber),
  };
}

export function validatePlanSpecPayload(payload) {
  const crId = normalizeCrId(payload.crId);
  const title = String(payload.title || '').trim();
  const crPrUrl = String(payload.crPrUrl || '').trim();

  if (!title) throw new Error('Payload field "title" is required');
  if (!crPrUrl) throw new Error('Payload field "crPrUrl" is required');

  return {
    crId,
    title,
    crPrUrl,
  };
}

export function validateImplementationPayload(payload) {
  const crId = normalizeCrId(payload.crId);
  const title = String(payload.title || '').trim();
  const crPrUrl = String(payload.crPrUrl || '').trim();
  const planPrUrl = String(payload.planPrUrl || '').trim();

  if (!title) throw new Error('Payload field "title" is required');
  if (!crPrUrl) throw new Error('Payload field "crPrUrl" is required');
  if (!planPrUrl) throw new Error('Payload field "planPrUrl" is required');

  return {
    crId,
    title,
    crPrUrl,
    planPrUrl,
  };
}
