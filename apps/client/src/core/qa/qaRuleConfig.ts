import type { ContourQualityIssueType } from '../structures/contourQuality';
import type { RtssQualityIssueType } from '../structures/rtssQuality';

const QA_RULE_CONFIG_STORAGE_KEY = 'contourlab.qa.ruleConfig';

export type QaRuleId = ContourQualityIssueType | RtssQualityIssueType;

export interface QaRuleDefinition {
  id: QaRuleId;
  section: 'contour' | 'rtss';
  label: string;
  description: string;
  severity: 'info' | 'warning';
  enabledByDefault: boolean;
}

export const QA_RULE_DEFINITIONS: QaRuleDefinition[] = [
  {
    id: 'empty',
    section: 'contour',
    label: 'Empty structure',
    description: 'Report structures that contain no contours.',
    severity: 'info',
    enabledByDefault: true,
  },
  {
    id: 'open-contour',
    section: 'contour',
    label: 'Open contour',
    description: 'Warn when a contour on a slice is not closed.',
    severity: 'warning',
    enabledByDefault: true,
  },
  {
    id: 'degenerate-contour',
    section: 'contour',
    label: 'Degenerate contour',
    description: 'Warn when contour polygon area is effectively zero.',
    severity: 'warning',
    enabledByDefault: true,
  },
  {
    id: 'slice-gap',
    section: 'contour',
    label: 'Slice gap',
    description: 'Warn when contour-bearing slices have a larger-than-expected gap.',
    severity: 'warning',
    enabledByDefault: true,
  },
  {
    id: 'area-jump',
    section: 'contour',
    label: 'Area jump',
    description: 'Warn when adjacent contour slices change area abruptly.',
    severity: 'warning',
    enabledByDefault: true,
  },
  {
    id: 'centroid-jump',
    section: 'contour',
    label: 'Centroid jump',
    description: 'Warn when adjacent contour slices shift centroid abruptly.',
    severity: 'warning',
    enabledByDefault: true,
  },
  {
    id: 'out-of-bounds',
    section: 'contour',
    label: 'Out of bounds',
    description: 'Warn when contour points extend outside the active image bounds.',
    severity: 'warning',
    enabledByDefault: true,
  },
  {
    id: 'empty-structure-set',
    section: 'rtss',
    label: 'Empty RTSS',
    description: 'Warn when an RT Structure Set contains no ROI definitions.',
    severity: 'warning',
    enabledByDefault: true,
  },
  {
    id: 'series-mismatch',
    section: 'rtss',
    label: 'Image set mismatch',
    description: 'Warn when the RTSS references a different image set than the active image.',
    severity: 'warning',
    enabledByDefault: true,
  },
  {
    id: 'duplicate-roi-name',
    section: 'rtss',
    label: 'Duplicate ROI name',
    description: 'Warn when multiple ROI names normalize to the same clinical name.',
    severity: 'warning',
    enabledByDefault: true,
  },
  {
    id: 'empty-roi',
    section: 'rtss',
    label: 'Empty ROI',
    description: 'Report ROI definitions that contain no contour sequence.',
    severity: 'info',
    enabledByDefault: true,
  },
  {
    id: 'missing-contour-reference',
    section: 'rtss',
    label: 'Missing contour reference',
    description: 'Warn when a contour has no referenced source image SOP.',
    severity: 'warning',
    enabledByDefault: true,
  },
  {
    id: 'foreign-contour-reference',
    section: 'rtss',
    label: 'Foreign contour reference',
    description: 'Warn when a contour references an image outside the active image set.',
    severity: 'warning',
    enabledByDefault: true,
  },
  {
    id: 'missing-rtstruct-source',
    section: 'rtss',
    label: 'Missing RTSTRUCT source',
    description: 'Report imported RTSS objects with no source SOP Instance UID.',
    severity: 'info',
    enabledByDefault: true,
  },
];

export type QaRuleConfig = Record<QaRuleId, boolean>;

const DEFAULT_QA_RULE_CONFIG = QA_RULE_DEFINITIONS.reduce((config, rule) => {
  config[rule.id] = rule.enabledByDefault;
  return config;
}, {} as QaRuleConfig);

let fallbackQaRuleConfig: QaRuleConfig = { ...DEFAULT_QA_RULE_CONFIG };

function readStoredQaRuleConfig(): Partial<QaRuleConfig> | null {
  try {
    const storage = window.localStorage;
    if (typeof storage?.getItem !== 'function') {
      return fallbackQaRuleConfig;
    }

    const raw = storage.getItem(QA_RULE_CONFIG_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<QaRuleConfig>) : fallbackQaRuleConfig;
  } catch {
    return fallbackQaRuleConfig;
  }
}

function writeStoredQaRuleConfig(config: QaRuleConfig): void {
  fallbackQaRuleConfig = { ...config };
  try {
    const storage = window.localStorage;
    if (typeof storage?.setItem === 'function') {
      storage.setItem(QA_RULE_CONFIG_STORAGE_KEY, JSON.stringify(config));
    }
  } catch {
    // Browser storage may be unavailable in restricted or test environments.
  }
}

function clearStoredQaRuleConfig(): void {
  fallbackQaRuleConfig = { ...DEFAULT_QA_RULE_CONFIG };
  try {
    const storage = window.localStorage;
    if (typeof storage?.removeItem === 'function') {
      storage.removeItem(QA_RULE_CONFIG_STORAGE_KEY);
    }
  } catch {
    // Browser storage may be unavailable in restricted or test environments.
  }
}

export function getQaRuleConfig(): QaRuleConfig {
  const stored = readStoredQaRuleConfig();
  return {
    ...DEFAULT_QA_RULE_CONFIG,
    ...stored,
  };
}

export function setQaRuleEnabled(ruleId: QaRuleId, enabled: boolean): QaRuleConfig {
  const next = {
    ...getQaRuleConfig(),
    [ruleId]: enabled,
  };
  writeStoredQaRuleConfig(next);
  return next;
}

export function resetQaRuleConfig(): QaRuleConfig {
  clearStoredQaRuleConfig();
  return getQaRuleConfig();
}
