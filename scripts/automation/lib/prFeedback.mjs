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

export function summarizeCompletionSync({ body, labels = [], merged }) {
  const labelNames = new Set(labels.map((label) => (typeof label === 'string' ? label : label.name)));
  const linkedCrPr = extractLinkedCrPr(body);

  return {
    merged: Boolean(merged),
    isImplementationPr: labelNames.has('pr:implementation'),
    linkedCrPr,
  };
}
