import {
  countHumanComments,
  extractLinkedCrPr,
  latestReviewStatesByUser,
} from './githubAutomation.mjs';

export function summarizeFeedback({ issueComments = [], reviewComments = [], reviews = [] }) {
  const humanIssueComments = countHumanComments(issueComments);
  const humanReviewComments = countHumanComments(reviewComments);
  const latestStates = latestReviewStatesByUser(reviews);
  const activeReviewStates = Object.fromEntries(latestStates);
  const hasChangesRequested = Array.from(latestStates.values()).includes('CHANGES_REQUESTED');
  const hasHumanFeedback = humanIssueComments + humanReviewComments > 0;

  return {
    humanIssueComments,
    humanReviewComments,
    activeReviewStates,
    hasChangesRequested,
    hasHumanFeedback,
  };
}

export function summarizePlanFeedback(input) {
  const base = summarizeFeedback(input);
  return {
    ...base,
    shouldLabelNeedsHuman: base.hasHumanFeedback,
  };
}

export function summarizeImplementationFeedback(input) {
  const base = summarizeFeedback(input);
  return {
    ...base,
    shouldLabelNeedsHuman: base.hasHumanFeedback || base.hasChangesRequested,
    shouldLabelReplan: base.hasChangesRequested,
  };
}

function renderStates(states) {
  const entries = Object.entries(states || {});
  if (!entries.length) {
    return '- none';
  }
  return entries.map(([login, state]) => `- ${login}: ${state}`).join('\n');
}

export function renderPlanFollowUpComment({ prNumber, feedback }) {
  return [
    '<!-- ai-follow-up:plan -->',
    `Automation follow-up for Plan PR #${prNumber}.`,
    '',
    `- Human issue comments: ${feedback.humanIssueComments}`,
    `- Human review comments: ${feedback.humanReviewComments}`,
    `- Needs human attention: ${feedback.shouldLabelNeedsHuman ? 'yes' : 'no'}`,
    '',
    'Active review states:',
    renderStates(feedback.activeReviewStates),
    '',
    feedback.shouldLabelNeedsHuman
      ? 'Triage result: human feedback detected. Review the comments, decide whether to revise the spec, and reply on-thread.'
      : 'Triage result: no active human feedback detected.',
  ].join('\n');
}

export function renderImplementationFollowUpComment({ prNumber, feedback }) {
  return [
    '<!-- ai-follow-up:implementation -->',
    `Automation follow-up for Implementation PR #${prNumber}.`,
    '',
    `- Human issue comments: ${feedback.humanIssueComments}`,
    `- Human review comments: ${feedback.humanReviewComments}`,
    `- Needs human attention: ${feedback.shouldLabelNeedsHuman ? 'yes' : 'no'}`,
    `- Replan suggested: ${feedback.shouldLabelReplan ? 'yes' : 'no'}`,
    '',
    'Active review states:',
    renderStates(feedback.activeReviewStates),
    '',
    feedback.shouldLabelReplan
      ? 'Triage result: plan-invalidating review detected. Return to spec review before continuing implementation.'
      : feedback.shouldLabelNeedsHuman
        ? 'Triage result: human feedback detected. Review comments, reply explicitly, and fix within the approved plan when possible.'
        : 'Triage result: no active human feedback detected.',
  ].join('\n');
}

export function summarizeCompletionSync({ body, labels = [], merged }) {
  const labelNames = new Set(labels.map((label) => (typeof label === 'string' ? label : label.name)));
  const linkedCrPr = extractLinkedCrPr(body);

  return {
    merged: Boolean(merged),
    isImplementationPr: labelNames.has('pr:implementation'),
    linkedCrPr,
  };
}
