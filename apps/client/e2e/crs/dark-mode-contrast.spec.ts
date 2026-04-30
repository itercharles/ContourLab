/**
 * @links:CRS-011
 * Smoke test: dark mode UI meets WCAG AA contrast on the patient browser
 * and structure panel surfaces.
 */
import { test, expect } from '@playwright/test';

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
    const s = h.replace('#', '').trim();
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  };
  const L1 = luminance(...parse(hex1));
  const L2 = luminance(...parse(hex2));
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

test.describe('dark mode WCAG AA contrast @links:CRS-011', () => {
  test(
    'patient browser and structure panel surfaces meet WCAG AA @links:CRS-011',
    async ({ page }) => {
      await page.goto('/');
      await expect(page.getByText('No active patient')).toBeVisible();

      const theme = await page.evaluate(
        () => document.documentElement.dataset['theme'] ?? 'dark'
      );
      expect(theme).toBe('dark');

      const tokens = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return {
          surface:    style.getPropertyValue('--color-surface').trim(),
          surfaceAlt: style.getPropertyValue('--color-surface-alt').trim(),
          text:       style.getPropertyValue('--color-text').trim(),
          textSec:    style.getPropertyValue('--color-text-sec').trim(),
          textMuted:  style.getPropertyValue('--color-text-muted').trim(),
        };
      });

      // Primary text on main surface (patient browser background) — WCAG AA
      expect(wcagContrast(tokens.text, tokens.surface)).toBeGreaterThanOrEqual(4.5);

      // Secondary text on main surface (structure panel labels) — WCAG AA
      expect(wcagContrast(tokens.textSec, tokens.surface)).toBeGreaterThanOrEqual(4.5);

      // Muted text on surface-alt (sidebar / panel alt backgrounds) — WCAG AA
      expect(wcagContrast(tokens.textMuted, tokens.surfaceAlt)).toBeGreaterThanOrEqual(4.5);
    }
  );
});
