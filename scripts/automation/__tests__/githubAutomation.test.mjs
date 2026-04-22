import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activeApprovedUsers,
  countHumanComments,
  crNumberFromId,
  docNameFromCrId,
  extractLinkedCrPr,
  hasAuthorizedApproval,
  latestReviewStatesByUser,
  normalizeCrId,
  validateImplementationPayload,
  validatePlanSpecPayload,
} from '../lib/githubAutomation.mjs';

test('normalizeCrId accepts canonical CR ids', () => {
  assert.equal(normalizeCrId('cr-123'), 'CR-123');
  assert.equal(crNumberFromId('cr-123'), '123');
  assert.equal(docNameFromCrId('cr-123', 'Spec'), 'CR123-Spec.md');
});

test('normalizeCrId rejects invalid ids', () => {
  assert.throws(() => normalizeCrId('123'), /Invalid CR id/);
});

test('validatePlanSpecPayload requires title and CR PR url', () => {
  assert.deepEqual(validatePlanSpecPayload({
    crId: 'CR-7',
    title: 'Example',
    crPrUrl: 'https://github.com/example/WebTPS-DHF/pull/7',
  }), {
    crId: 'CR-7',
    title: 'Example',
    crPrUrl: 'https://github.com/example/WebTPS-DHF/pull/7',
  });

  assert.throws(() => validatePlanSpecPayload({ crId: 'CR-7', title: '', crPrUrl: 'x' }), /title/);
  assert.throws(() => validatePlanSpecPayload({ crId: 'CR-7', title: 'x', crPrUrl: '' }), /crPrUrl/);
});

test('validateImplementationPayload requires plan PR url', () => {
  assert.deepEqual(validateImplementationPayload({
    crId: 'CR-8',
    title: 'Impl',
    crPrUrl: 'https://github.com/example/WebTPS-DHF/pull/8',
    planPrUrl: 'https://github.com/example/WebTPS/pull/18',
  }), {
    crId: 'CR-8',
    title: 'Impl',
    crPrUrl: 'https://github.com/example/WebTPS-DHF/pull/8',
    planPrUrl: 'https://github.com/example/WebTPS/pull/18',
  });

  assert.throws(() => validateImplementationPayload({
    crId: 'CR-8',
    title: 'Impl',
    crPrUrl: 'https://github.com/example/WebTPS-DHF/pull/8',
  }), /planPrUrl/);
});

test('latestReviewStatesByUser keeps only latest state per reviewer', () => {
  const reviews = [
    { user: { login: 'alice' }, state: 'APPROVED' },
    { user: { login: 'bob' }, state: 'COMMENTED' },
    { user: { login: 'alice' }, state: 'CHANGES_REQUESTED' },
  ];

  assert.deepEqual(Object.fromEntries(latestReviewStatesByUser(reviews)), {
    alice: 'CHANGES_REQUESTED',
    bob: 'COMMENTED',
  });
});

test('activeApprovedUsers and hasAuthorizedApproval respect latest review state', () => {
  const reviews = [
    { user: { login: 'alice' }, state: 'APPROVED' },
    { user: { login: 'bob' }, state: 'APPROVED' },
    { user: { login: 'alice' }, state: 'CHANGES_REQUESTED' },
  ];

  assert.deepEqual(activeApprovedUsers(reviews), ['bob']);
  assert.equal(hasAuthorizedApproval(reviews, ['alice']), false);
  assert.equal(hasAuthorizedApproval(reviews, ['bob']), true);
  assert.equal(hasAuthorizedApproval(reviews, []), false);
});

test('countHumanComments ignores bot comments', () => {
  const comments = [
    { user: { type: 'User' } },
    { user: { type: 'Bot' } },
    { user: {} },
  ];

  assert.equal(countHumanComments(comments), 2);
});

test('extractLinkedCrPr parses CR PR link from PR body', () => {
  assert.deepEqual(
    extractLinkedCrPr('CR PR: https://github.com/example/WebTPS-DHF/pull/42'),
    {
      url: 'https://github.com/example/WebTPS-DHF/pull/42',
      owner: 'example',
      repo: 'WebTPS-DHF',
      pullNumber: 42,
    }
  );

  assert.equal(extractLinkedCrPr('no link here'), null);
});
