import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderImplementationFollowUpComment,
  renderPlanFollowUpComment,
  summarizeCompletionSync,
  summarizeImplementationFeedback,
  summarizePlanFeedback,
} from '../lib/prFeedback.mjs';

test('summarizePlanFeedback counts human comments and latest review states', () => {
  const summary = summarizePlanFeedback({
    issueComments: [{ user: { type: 'User' } }, { user: { type: 'Bot' } }],
    reviewComments: [{ user: { type: 'User' } }],
    reviews: [
      { user: { login: 'alice' }, state: 'APPROVED' },
      { user: { login: 'alice' }, state: 'COMMENTED' },
      { user: { login: 'bob' }, state: 'APPROVED' },
    ],
  });

  assert.equal(summary.humanIssueComments, 1);
  assert.equal(summary.humanReviewComments, 1);
  assert.deepEqual(summary.activeReviewStates, {
    alice: 'COMMENTED',
    bob: 'APPROVED',
  });
  assert.equal(summary.shouldLabelNeedsHuman, true);
});

test('summarizeImplementationFeedback flags replan on changes requested', () => {
  const summary = summarizeImplementationFeedback({
    issueComments: [],
    reviewComments: [],
    reviews: [{ user: { login: 'alice' }, state: 'CHANGES_REQUESTED' }],
  });

  assert.equal(summary.hasChangesRequested, true);
  assert.equal(summary.shouldLabelNeedsHuman, true);
  assert.equal(summary.shouldLabelReplan, true);
});

test('render follow-up comments include marker and triage result', () => {
  const planComment = renderPlanFollowUpComment({
    prNumber: 11,
    feedback: {
      humanIssueComments: 1,
      humanReviewComments: 0,
      activeReviewStates: { alice: 'APPROVED' },
      shouldLabelNeedsHuman: true,
    },
  });
  assert.match(planComment, /ai-follow-up:plan/);
  assert.match(planComment, /Triage result:/);

  const implementationComment = renderImplementationFollowUpComment({
    prNumber: 12,
    feedback: {
      humanIssueComments: 0,
      humanReviewComments: 1,
      activeReviewStates: { bob: 'CHANGES_REQUESTED' },
      shouldLabelNeedsHuman: true,
      shouldLabelReplan: true,
    },
  });
  assert.match(implementationComment, /ai-follow-up:implementation/);
  assert.match(implementationComment, /Replan suggested: yes/);
});

test('summarizeCompletionSync recognizes implementation PR and linked CR', () => {
  const summary = summarizeCompletionSync({
    merged: true,
    labels: [{ name: 'pr:implementation' }],
    body: 'CR PR: https://github.com/example/WebTPS-DHF/pull/55',
  });

  assert.equal(summary.merged, true);
  assert.equal(summary.isImplementationPr, true);
  assert.deepEqual(summary.linkedCrPr, {
    url: 'https://github.com/example/WebTPS-DHF/pull/55',
    owner: 'example',
    repo: 'WebTPS-DHF',
    pullNumber: 55,
  });
});
