/**
 * Custom Playwright reporter that extracts @links:SYS-xxx / @links:CRS-xxx annotations
 * from test/suite titles and emits a JUnit XML with medharness.links properties,
 * matching the format expected by `medharness --junit`.
 *
 * Annotation syntax (anywhere in describe/test title):
 *   test.describe('Workspace context @links:SYS-012,SYS-011', () => { ... })
 *   test('workspace bar visible @links:SYS-012', ...)
 *
 * Links on a describe block are inherited by all descendant test cases.
 */

import type {
  Reporter,
  TestCase,
  TestResult,
  FullConfig,
  Suite,
  FullResult,
} from '@playwright/test/reporter';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const LINKS_RE = /@links:([\w-]+(?:,[\w-]+)*)/g;
const TESTING_RE = /@testing:(T\d+)/g;

function parseLinks(name: string): string[] {
  const found: string[] = [];
  let m: RegExpExecArray | null;
  LINKS_RE.lastIndex = 0;
  while ((m = LINKS_RE.exec(name)) !== null) {
    found.push(...m[1].split(',').map((s) => s.trim()).filter(Boolean));
  }
  return found;
}

function parseTestingPoints(name: string): string[] {
  const found: string[] = [];
  let m: RegExpExecArray | null;
  TESTING_RE.lastIndex = 0;
  while ((m = TESTING_RE.exec(name)) !== null) {
    found.push(m[1]);
  }
  return found;
}

function escapeXml(s: string): string {
  return s
    // strip ANSI escape sequences (control characters invalid in XML)
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    // strip other control chars that are illegal in XML (keep tab, LF, CR)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Collect @links from all ancestor suites up to the root. */
function ancestorLinks(test: TestCase): string[] {
  const links: string[] = [];
  let suite: Suite | undefined = test.parent;
  while (suite) {
    links.push(...parseLinks(suite.title));
    suite = suite.parent;
  }
  return links;
}

interface Entry {
  suiteName: string;
  testName: string;
  links: string[];
  testingPoints: string[];
  passed: boolean;
  durationMs: number;
  errorMsg?: string;
}

class PlaywrightJunitReporter implements Reporter {
  private outputFile: string;
  private entries: Entry[] = [];

  constructor(options: { outputFile?: string } = {}) {
    this.outputFile =
      options.outputFile ??
      process.env['PLAYWRIGHT_JUNIT_OUTPUT_NAME'] ??
      'test-results/results.xml';
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onBegin(_config: FullConfig, _suite: Suite): void {
    this.entries = [];
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'skipped') return;

    const testLinks = parseLinks(test.title);
    const parentLinks = ancestorLinks(test);
    const links = [...new Set([...parentLinks, ...testLinks])];

    if (links.length === 0) return;

    const testPoints = parseTestingPoints(test.title);
    let suite: Suite | undefined = test.parent;
    while (suite) {
      testPoints.push(...parseTestingPoints(suite.title));
      suite = suite.parent;
    }
    const testingPoints = [...new Set(testPoints)];

    const suiteName = test.parent?.title ?? '';

    this.entries.push({
      suiteName,
      testName: test.title,
      links,
      testingPoints,
      passed: result.status === 'passed',
      durationMs: result.duration,
      errorMsg: result.errors[0]?.message,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onEnd(_result: FullResult): void {
    if (this.entries.length === 0) return;

    const failures = this.entries.filter((e) => !e.passed).length;
    const totalSec = (this.entries.reduce((s, e) => s + e.durationMs, 0) / 1000).toFixed(3);
    const count = this.entries.length;

    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<testsuites tests="${count}" failures="${failures}" skipped="0" time="${totalSec}">`,
      `  <testsuite name="dhf-verification" tests="${count}" failures="${failures}" skipped="0" time="${totalSec}">`,
    ];

    for (const e of this.entries) {
      const dur = (e.durationMs / 1000).toFixed(3);
      lines.push(
        `    <testcase name="${escapeXml(e.testName)}" classname="${escapeXml(e.suiteName)}" time="${dur}">`,
        `      <properties>`,
        `        <property name="medharness.links" value="${e.links.join(',')}"/>`,
      );
      if (e.testingPoints.length > 0) {
        lines.push(`        <property name="medharness.testing" value="${e.testingPoints.join(',')}"/>`);
      }
      lines.push(`      </properties>`);
      if (!e.passed) {
        lines.push(`      <failure message="${escapeXml(e.errorMsg ?? 'Test failed')}"/>`);
      }
      lines.push(`    </testcase>`);
    }

    lines.push('  </testsuite>', '</testsuites>');

    const absPath = this.outputFile.startsWith('/')
      ? this.outputFile
      : `${process.cwd()}/${this.outputFile}`;
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, lines.join('\n'), 'utf-8');
  }
}

export default PlaywrightJunitReporter;
