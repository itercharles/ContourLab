import type { StructureSet } from '@webtps/shared-types';

export type RtssQualityIssueType =
  | 'empty-structure-set'
  | 'series-mismatch'
  | 'duplicate-roi-name'
  | 'empty-roi'
  | 'missing-contour-reference'
  | 'foreign-contour-reference'
  | 'missing-rtstruct-source';

export type RtssQualitySeverity = 'info' | 'warning';

export interface RtssQualityIssue {
  type: RtssQualityIssueType;
  severity: RtssQualitySeverity;
  message: string;
  structureId?: string;
  structureName?: string;
  slicePosition?: number;
}

export interface RtssQualitySummary {
  issueCount: number;
  warningCount: number;
  issues: RtssQualityIssue[];
}

export interface RtssQualityContext {
  activeSeriesUID?: string | null;
  imageSopInstanceUIDs?: string[];
  enabledRules?: Partial<Record<RtssQualityIssueType, boolean>>;
}

function formatSlicePosition(slicePosition: number | undefined): string {
  return Number.isFinite(slicePosition) ? `z=${slicePosition!.toFixed(1)} mm` : 'unknown slice';
}

export function analyzeRtssQuality(
  structureSet: StructureSet,
  context: RtssQualityContext = {}
): RtssQualitySummary {
  const issues: RtssQualityIssue[] = [];
  const activeSeriesUID = context.activeSeriesUID ?? null;
  const imageSopInstanceUIDs = new Set(context.imageSopInstanceUIDs ?? []);
  const isRuleEnabled = (rule: RtssQualityIssueType) =>
    context.enabledRules?.[rule] !== false;

  if (
    isRuleEnabled('series-mismatch') &&
    activeSeriesUID &&
    structureSet.referencedSeriesUID !== activeSeriesUID
  ) {
    issues.push({
      type: 'series-mismatch',
      severity: 'warning',
      message: 'RTSS references a different image set than the active image.',
    });
  }

  if (isRuleEnabled('empty-structure-set') && structureSet.structures.length === 0) {
    issues.push({
      type: 'empty-structure-set',
      severity: 'warning',
      message: 'RTSS contains no ROI definitions.',
    });
  }

  if (
    isRuleEnabled('missing-rtstruct-source') &&
    structureSet.source?.type === 'rtstruct' &&
    !structureSet.source.sopInstanceUID
  ) {
    issues.push({
      type: 'missing-rtstruct-source',
      severity: 'info',
      message: 'Loaded RTSS has no source SOP Instance UID.',
    });
  }

  const roiNames = new Map<string, string[]>();
  structureSet.structures.forEach((structure) => {
    const normalizedName = structure.name.trim().toLowerCase();
    if (!normalizedName) return;
    roiNames.set(normalizedName, [...(roiNames.get(normalizedName) ?? []), structure.name]);
  });

  roiNames.forEach((names) => {
    if (!isRuleEnabled('duplicate-roi-name') || names.length <= 1) return;
    issues.push({
      type: 'duplicate-roi-name',
      severity: 'warning',
      message: `Duplicate ROI name "${names[0]}".`,
    });
  });

  structureSet.structures.forEach((structure) => {
    if (isRuleEnabled('empty-roi') && structure.contours.length === 0) {
      issues.push({
        type: 'empty-roi',
        severity: 'info',
        structureId: structure.id,
        structureName: structure.name,
        message: `${structure.name}: ROI has no contour sequence.`,
      });
      return;
    }

    structure.contours.forEach((contour) => {
      if (isRuleEnabled('missing-contour-reference') && !contour.referencedSOPInstanceUID) {
        issues.push({
          type: 'missing-contour-reference',
          severity: 'warning',
          structureId: structure.id,
          structureName: structure.name,
          slicePosition: contour.slicePosition,
          message: `${structure.name}: contour at ${formatSlicePosition(contour.slicePosition)} has no referenced image SOP.`,
        });
        return;
      }

      if (
        isRuleEnabled('foreign-contour-reference') &&
        imageSopInstanceUIDs.size > 0 &&
        !imageSopInstanceUIDs.has(contour.referencedSOPInstanceUID)
      ) {
        issues.push({
          type: 'foreign-contour-reference',
          severity: 'warning',
          structureId: structure.id,
          structureName: structure.name,
          slicePosition: contour.slicePosition,
          message: `${structure.name}: contour at ${formatSlicePosition(contour.slicePosition)} references an image outside the active image set.`,
        });
      }
    });
  });

  return {
    issueCount: issues.length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    issues,
  };
}
