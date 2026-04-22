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
