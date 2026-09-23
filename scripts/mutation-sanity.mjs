#!/usr/bin/env node
/**
 * Do the tests actually constrain the behaviour?
 *
 * A high coverage number only says every line ran — not that anything would
 * notice if a line were wrong. This script answers the stronger question by
 * deliberately breaking the code: it flips a handful of load-bearing constants,
 * one at a time, and asserts that the suite GOES RED each time.
 *
 * A mutation that survives is a hole in the tests, and the script fails the
 * build so it cannot be ignored. The source file is always restored, including
 * when the run is interrupted.
 *
 *   node scripts/mutation-sanity.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const MUTATIONS = [
  {
    name: 'money rounding: half-up -> half-even',
    file: 'src/domain/money.ts',
    from: "export const MONEY_ROUNDING: 'half-up' | 'half-even' = 'half-up'",
    to: "export const MONEY_ROUNDING: 'half-up' | 'half-even' = 'half-even'",
    expect: 'the money suite should notice a changed rounding convention',
  },
  {
    name: 'SLA amber threshold: 25% -> 40%',
    file: 'src/domain/sla.ts',
    from: '  atRiskThresholdPct: 25,',
    to: '  atRiskThresholdPct: 40,',
    expect: 'the SLA state boundaries should be pinned, not incidental',
  },
  {
    name: 'licence check validity: 365 -> 30 days',
    file: 'src/domain/pipeline.ts',
    from: 'export const LICENCE_CHECK_VALID_DAYS = 365',
    to: 'export const LICENCE_CHECK_VALID_DAYS = 30',
    expect: 'the test-drive guard boundary should be asserted',
  },
  {
    name: 'pipeline rewind limit: 1 -> 5 stages',
    file: 'src/domain/pipeline.ts',
    from: 'export const BACKWARD_LIMIT = 1',
    to: 'export const BACKWARD_LIMIT = 5',
    expect: 'the transition table should pin how far a lead can be rewound',
  },
]

function runTests() {
  try {
    execFileSync('npx', ['vitest', 'run', '--silent', '--coverage.enabled=false'], {
      cwd: ROOT,
      stdio: 'pipe',
    })
    return true // suite passed
  } catch {
    return false // suite failed
  }
}

function main() {
  console.log('\n  mutation sanity: breaking the code on purpose\n')

  const survivors = []
  let killed = 0

  for (const mutation of MUTATIONS) {
    const path = resolve(ROOT, mutation.file)
    const original = readFileSync(path, 'utf8')

    if (!original.includes(mutation.from)) {
      console.error(`   ! ${mutation.name}: anchor text not found in ${mutation.file}`)
      survivors.push(`${mutation.name} (anchor missing — the script is stale)`)
      continue
    }

    writeFileSync(path, original.replace(mutation.from, mutation.to), 'utf8')
    let suitePassed
    try {
      suitePassed = runTests()
    } finally {
      writeFileSync(path, original, 'utf8') // always restore
    }

    if (suitePassed) {
      console.log(`   ✗ SURVIVED  ${mutation.name}`)
      survivors.push(`${mutation.name} — ${mutation.expect}`)
    } else {
      console.log(`   ✓ killed    ${mutation.name}`)
      killed += 1
    }
  }

  const summary = `${killed}/${MUTATIONS.length} mutations killed`
  console.log(`\n  ${summary}\n`)

  // Surface the result in the CI job summary when running on GitHub Actions.
  const stepSummary = process.env.GITHUB_STEP_SUMMARY
  if (stepSummary) {
    const lines = [
      '### Mutation sanity',
      '',
      `**${summary}**`,
      '',
      survivors.length === 0
        ? 'Every deliberately-broken constant was caught by the test suite.'
        : ['Survivors (gaps in the suite):', '', ...survivors.map((s) => `- ${s}`)].join('\n'),
      '',
    ].join('\n')
    try {
      writeFileSync(stepSummary, lines, { flag: 'a' })
    } catch {
      // A summary is a nicety; never fail the build over it.
    }
  }

  if (survivors.length > 0) {
    console.error('  Some mutations survived — the suite does not constrain those constants.\n')
    process.exit(1)
  }
}

main()
