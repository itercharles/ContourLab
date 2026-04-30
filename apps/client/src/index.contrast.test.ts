/**
 * @links:SRS-018
 * Verifies that dark theme design tokens meet WCAG AA contrast thresholds:
 * ≥ 4.5:1 for normal text, ≥ 3:1 for large text / UI controls.
 */
import { describe, it, expect } from 'vitest';

function sRGBLinearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(r: number, g: number, b: number): number {
  return (
    0.2126 * sRGBLinearize(r) +
    0.7152 * sRGBLinearize(g) +
    0.0722 * sRGBLinearize(b)
  );
}

function wcagContrast(hex1: string, hex2: string): number {
  const parse = (h: string): [number, number, number] => {
    const s = h.replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  };
  const L1 = luminance(...parse(hex1));
  const L2 = luminance(...parse(hex2));
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Dark theme tokens (must stay in sync with index.css :root / [data-theme="dark"])
const dark = {
  surface:    '#161b22',
  surfaceAlt: '#0d1117',
  text:       '#e6edf3',
  textBright: '#f0f6fc',
  textSec:    '#8b949e',
  textMuted:  '#7d8590',
};

const NORMAL_TEXT = 4.5;
const LARGE_TEXT  = 3.0;

describe('dark theme contrast ratios @links:SRS-018', () => {
  describe('primary text on surface (≥ 4.5:1)', () => {
    it('--color-text on --color-surface', () => {
      expect(wcagContrast(dark.text, dark.surface)).toBeGreaterThanOrEqual(NORMAL_TEXT);
    });
    it('--color-text-bright on --color-surface', () => {
      expect(wcagContrast(dark.textBright, dark.surface)).toBeGreaterThanOrEqual(NORMAL_TEXT);
    });
    it('--color-text-sec on --color-surface', () => {
      expect(wcagContrast(dark.textSec, dark.surface)).toBeGreaterThanOrEqual(NORMAL_TEXT);
    });
    it('--color-text-muted on --color-surface', () => {
      expect(wcagContrast(dark.textMuted, dark.surface)).toBeGreaterThanOrEqual(NORMAL_TEXT);
    });
  });

  describe('primary text on surface-alt (≥ 4.5:1)', () => {
    it('--color-text on --color-surface-alt', () => {
      expect(wcagContrast(dark.text, dark.surfaceAlt)).toBeGreaterThanOrEqual(NORMAL_TEXT);
    });
    it('--color-text-sec on --color-surface-alt', () => {
      expect(wcagContrast(dark.textSec, dark.surfaceAlt)).toBeGreaterThanOrEqual(NORMAL_TEXT);
    });
    it('--color-text-muted on --color-surface-alt', () => {
      expect(wcagContrast(dark.textMuted, dark.surfaceAlt)).toBeGreaterThanOrEqual(NORMAL_TEXT);
    });
  });

  describe('large text / UI controls on surface (≥ 3:1)', () => {
    it('--color-text on --color-surface', () => {
      expect(wcagContrast(dark.text, dark.surface)).toBeGreaterThanOrEqual(LARGE_TEXT);
    });
    it('--color-text-sec on --color-surface', () => {
      expect(wcagContrast(dark.textSec, dark.surface)).toBeGreaterThanOrEqual(LARGE_TEXT);
    });
  });
});
