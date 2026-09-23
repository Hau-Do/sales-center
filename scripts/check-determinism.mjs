#!/usr/bin/env node
/**
 * The determinism contract, enforced as a build step.
 *
 * ESLint already bans these patterns, but lint rules can be disabled inline
 * with a comment. This is a blunt grep that cannot be, so the two together are
 * hard to route around by accident.
 *
 * See docs/testing.md for why each rule exists.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(full)) out.push(full)
  }
  return out
}

const RULES = [
  {
    dir: 'cypress',
    pattern: /\bcy\.wait\s*\(/,
    message:
      'cy.wait() found. Fixed sleeps rot into flakes — wait on cy.settled(), which reads the app’s data-app-busy attribute.',
  },
  {
    dir: 'cypress',
    pattern: /\bcy\.intercept\s*\(/,
    message:
      'cy.intercept() found. MSW is the single mocking layer; cy.intercept stubs fetch inside the page so requests never reach the service worker.',
  },
  {
    dir: 'src/domain',
    pattern: /\bDate\.now\s*\(|new\s+Date\s*\(\s*\)|\bMath\.random\s*\(/,
    message:
      'Ambient time or randomness in the domain layer. Take a Clock or Rng port instead — see src/ports.',
    skip: /\.(test|spec)\.tsx?$/,
  },
]

let failures = 0

for (const rule of RULES) {
  const base = resolve(ROOT, rule.dir)
  let files
  try {
    files = walk(base)
  } catch {
    continue // the directory may not exist yet
  }

  for (const file of files) {
    if (rule.skip?.test(file)) continue
    const text = readFileSync(file, 'utf8')
    text.split('\n').forEach((line, index) => {
      // Ignore the rule descriptions in comments.
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
      if (rule.pattern.test(line)) {
        console.error(`  ✗ ${relative(ROOT, file)}:${index + 1}  ${rule.message}`)
        failures += 1
      }
    })
  }
}

if (failures > 0) {
  console.error(`\n  determinism check failed: ${failures} violation(s)\n`)
  process.exit(1)
}

console.log('  determinism check: no fixed sleeps, no competing mock layer, no ambient clock in the domain.')
