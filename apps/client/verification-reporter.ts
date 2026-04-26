/**
 * Vitest reporter that extracts @links:SRS-xxx / @links:SYS-xxx annotations from
 * test/suite names and emits a JUnit XML for DHF verification test evidence.
 *
 * Annotation syntax (anywhere in describe/it name):
 *   describe('inferTypeFromName @links:SRS-005', () => { ... })
 *   it('handles edge case @links:SRS-005,SRS-006', () => { ... })
 *
 * Links on a describe block are inherited by all descendant test cases.
 */

import type { Reporter } from 'vitest/node'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import process from 'node:process'

const LINKS_RE = /@links:([\w-]+(?:,[\w-]+)*)/g

function parseLinks(name: string): string[] {
  const found: string[] = []
  let m: RegExpExecArray | null
  LINKS_RE.lastIndex = 0
  while ((m = LINKS_RE.exec(name)) !== null) {
    found.push(...m[1].split(',').map((s) => s.trim()).filter(Boolean))
  }
  return found
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

interface Entry {
  classname: string
  name: string
  links: string[]
  status: 'pass' | 'fail' | 'skip'
  durationMs: number
  errorMsg?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectTests(tasks: any[], classname: string, parentLinks: string[], out: Entry[]) {
  for (const task of tasks) {
    const myLinks = [...new Set([...parentLinks, ...parseLinks(task.name as string)])]
    if (task.type === 'test') {
      out.push({
        classname,
        name: task.name as string,
        links: myLinks,
        status:
          task.result?.state === 'pass'
            ? 'pass'
            : task.result?.state === 'fail'
              ? 'fail'
              : 'skip',
        durationMs: (task.result?.duration as number) ?? 0,
        errorMsg: task.result?.errors?.[0]?.message as string | undefined,
      })
    } else if (task.type === 'suite' && Array.isArray(task.tasks)) {
      collectTests(task.tasks, classname, myLinks, out)
    }
  }
}

export default class VerificationReporter implements Reporter {
  private outputFile: string

  constructor(options: { outputFile?: string } = {}) {
    this.outputFile = options.outputFile ?? 'test-results/verification-junit.xml'
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onFinished(files: any[] = []) {
    const entries: Entry[] = []
    for (const file of files) {
      const classname = relative(process.cwd(), file.filepath as string).replace(/\\/g, '/')
      collectTests(file.tasks ?? [], classname, parseLinks(file.name as string), entries)
    }

    const linked = entries.filter((e) => e.links.length > 0)
    if (linked.length === 0) return

    const failures = linked.filter((e) => e.status === 'fail').length
    const skipped = linked.filter((e) => e.status === 'skip').length
    const totalMs = linked.reduce((s, e) => s + e.durationMs, 0)
    const totalSec = (totalMs / 1000).toFixed(3)

    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<testsuites tests="${linked.length}" failures="${failures}" skipped="${skipped}" time="${totalSec}">`,
      `  <testsuite name="dhf-verification" tests="${linked.length}" failures="${failures}" skipped="${skipped}" time="${totalSec}">`,
    ]

    for (const e of linked) {
      const dur = (e.durationMs / 1000).toFixed(3)
      lines.push(
        `    <testcase name="${escapeXml(e.name)}" classname="${escapeXml(e.classname)}" time="${dur}">`,
        `      <properties>`,
        `        <property name="compliantflow.links" value="${e.links.join(',')}"/>`,
        `      </properties>`,
      )
      if (e.status === 'fail') {
        lines.push(`      <failure message="${escapeXml(e.errorMsg ?? 'Test failed')}"/>`)
      } else if (e.status === 'skip') {
        lines.push(`      <skipped/>`)
      }
      lines.push(`    </testcase>`)
    }

    lines.push('  </testsuite>', '</testsuites>')

    const absPath = this.outputFile.startsWith('/')
      ? this.outputFile
      : `${process.cwd()}/${this.outputFile}`
    mkdirSync(dirname(absPath), { recursive: true })
    writeFileSync(absPath, lines.join('\n'), 'utf-8')
  }
}
