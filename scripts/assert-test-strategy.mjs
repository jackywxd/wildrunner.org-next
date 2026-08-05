#!/usr/bin/env node
/**
 * Enforce the mechanical parts of docs/testing-strategy.md.
 *
 * The strategy exists because a session was spent debugging tests rather than
 * code: a test that caused the hydration error it reported, a test asserting a
 * code path the Worker never runs, a test asserting a count nothing could
 * satisfy. Every one of those was avoidable from the shape of the test alone.
 *
 * A document does not prevent them — AGENTS.md already carried rules that were
 * broken repeatedly in the same session. This runs in CI's `checks` job (~40s,
 * no database, no browser) so the rules bind before review does.
 *
 * Deliberately narrow. Every rule here is one a human cannot argue with from
 * the source text, because a checker that produces arguable findings gets
 * switched off. Judgement-based rules — "is this the cheapest level", "is the
 * failure named" — stay in the document and in review.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const E2E = 'e2e'

/**
 * Violations that predate the strategy.
 *
 * This list may only shrink. Adding to it needs the same justification as
 * disabling the rule, because that is what it does for that test.
 */
const GRANDFATHERED = new Set([
  // Rule 4 — gate themselves off against the only environment that ships.
  // All three depend on real Workers AI latency exceeding a 60s window.
  'ai/expand-post.spec.ts::P4-T5',
  'members/ai.spec.ts::M6-T3',
  'members/media-pipeline.spec.ts::M5-T4',
  // Rule 5 — read ambient data without declaring it. Ownership is the one
  // class where that is arguably the point; the rest are quota counters.
  'members/large-upload.spec.ts::V2-T2',
  'members/media-library.spec.ts::E-T6',
])

function specFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...specFiles(path))
    else if (entry.endsWith('.spec.ts')) out.push(path)
  }
  return out
}

/**
 * Strip comments before matching code rules.
 *
 * Without this the checker reads its own explanations. A1-T4's doc comment
 * quotes the `page.evaluate(... setAttribute ...)` it was rewritten to avoid,
 * and because bodies are split on `test(` boundaries that comment belongs to
 * the *preceding* test — so fixing the violation reported it against A1-T3.
 * A checker that flags the prose describing a fix is worse than no checker.
 *
 * The §5 declaration rule deliberately runs against the raw text: there, the
 * comment is the thing being asked for.
 */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Split a spec into its individual `test(...)` bodies. */
function tests(source) {
  const parts = source.split(/(?=^\s*test\(\s*[`"'])/m)
  const out = []
  for (const part of parts) {
    const match = part.match(/^\s*test\(\s*[`"']([^`"']+)/)
    if (!match) continue
    const title = match[1]
    const id = title.match(/^[A-Z][A-Za-z0-9]*-T[0-9]+/)?.[0] ?? title.slice(0, 40)
    out.push({ id, title, body: stripComments(part), raw: part })
  }
  return out
}

const problems = []
const report = (file, id, rule, detail) => {
  const key = `${file.replace(`${E2E}/`, '')}::${id}`
  if (GRANDFATHERED.has(key)) return
  problems.push({ key, rule, detail })
}

for (const file of specFiles(E2E)) {
  const source = readFileSync(file, 'utf8')
  const usesPage = /\bpage\./.test(source)
  const relative = file.replace(`${E2E}/`, '')

  // §4 journey — every browser spec must go through the console guard, or a
  // page that logs errors passes silently. This is the rule that a whole
  // admin panel failing hydration got past.
  if (usesPage && !/from ["'][^"']*helpers\/test["']/.test(source)) {
    problems.push({
      key: relative,
      rule: 'journey specs import `test` from e2e/helpers/test.ts',
      detail: 'drives a browser but bypasses the pageerror/console.error guard',
    })
  }

  for (const { id, body, raw } of tests(source)) {
    // §3.3 — a test that writes the state it asserts on is watching itself.
    if (/page\.evaluate\((?:[^)]|\)(?!\s*[,;]))*?(setAttribute|classList|innerHTML|document\.\w+\s*=)/s.test(body)) {
      report(file, id, '§3.3 must not cause what it observes', 'mutates the DOM via page.evaluate')
    }

    // §4 deployed — a test that skips against a deployed origin asserts
    // nothing about what ships.
    if (/test\.skip\((?:[^)]|\)(?!\s*[,;]))*?(includes\(["']localhost["']\)|!baseURL)/s.test(body)) {
      report(file, id, '§4 deployed tests must be meaningful where they ship', 'skips itself against a deployed origin')
    }

    // §5 — a count over a whole result set is one of two very different
    // tests and the reader cannot tell which from the code.
    //
    //   fixture-scoped: `totalDocs === 1` because access control returns
    //     exactly the caller's own row, whatever else exists (M0-T4).
    //   corpus-scoped:  `totalDocs === 0` because *every* row in the database
    //     must satisfy something (M1-T8).
    //
    // The second breaks when the data is wrong rather than when the code is,
    // needs to cover its whole class, and is worthless against local D1's e2e
    // residue. So the rule is not "don't do it" — it is "say which".
    //
    // Narrowed twice already: `limit=300` followed by `toContain(ownSlug)` is
    // fixture-scoped and correct, and flagging it made this checker produce
    // arguable findings, which is how a checker gets switched off.
    const assertsWholeSet =
      /totalDocs\s*\)?\s*\)?\s*\.?to(Be|Equal)\(/.test(body) ||
      /expect\(\s*(docs|rows|slugs)\s*\)\.toHaveLength\(/.test(body)
    // Raw, not stripped: the declaration this asks for *is* a comment.
    const declares = /corpus-scoped|fixture-scoped/.test(raw)
    if (assertsWholeSet && !declares) {
      report(
        file,
        id,
        '§5 a whole-set count says which kind it is',
        'add `corpus-scoped:` or `fixture-scoped:` to a comment explaining the number',
      )
    }
  }
}

if (problems.length) {
  console.error(`\n${problems.length} test-strategy violation(s) — see docs/testing-strategy.md\n`)
  for (const { key, rule, detail } of problems) {
    console.error(`  ${key}\n      ${rule}\n      ${detail}\n`)
  }
  process.exit(1)
}

console.log(
  `test strategy: ok (${specFiles(E2E).length} specs checked, ` +
    `${GRANDFATHERED.size} grandfathered)`,
)
