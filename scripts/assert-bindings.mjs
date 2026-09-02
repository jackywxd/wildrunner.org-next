#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerPath = path.join(root, "wrangler.jsonc");
const raw = fs.readFileSync(wranglerPath, "utf8");
const json = JSON.parse(
  raw.replace(/^\s*\/\/.*$/gm, "").replace(/,\s*([}\]])/g, "$1"),
);

const required = {
  D1: Boolean(json.d1_databases?.some((item) => item.binding === "D1")),
  R2: Boolean(json.r2_buckets?.some((item) => item.binding === "R2")),
  AI: json.ai?.binding === "AI",
  IMAGES: json.images?.binding === "IMAGES",
  STREAM: json.stream?.binding === "STREAM",
};

const missing = Object.entries(required)
  .filter(([, ok]) => !ok)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(`Missing wrangler bindings: ${missing.join(", ")}`);
  process.exit(1);
}

/**
 * A `var` that shadows a constant in the source has to agree with it.
 *
 * WHY THIS EXISTS. `defaultQuotaMb()` reads `MEMBER_STORAGE_QUOTA_MB` and
 * falls back to `DEFAULT_QUOTA_MB` only when it is unset — which is true of
 * local dev and of nowhere else, because `wrangler.jsonc` sets the variable in
 * both deployed environments. The constant was raised from 10 GB to 100 GB and
 * these lines were not, so every member kept seeing "10.00 GB" on their
 * storage bar. Nothing failed, nothing logged, and the number on screen is
 * exactly what a working storage bar looks like — it was found by a person
 * looking at the page and asking why.
 *
 * Both environments are checked, not just production: staging having its own
 * copy is what makes this two lines that can disagree rather than one.
 *
 * Parsed rather than imported because this is a `.mjs` script and the constant
 * lives in TypeScript. A shape this cannot read is an error, never a pass —
 * a checker that silently skips is worse than no checker, since its silence
 * reads as agreement.
 */
const quotaSource = fs.readFileSync(path.join(root, "src/lib/quota.ts"), "utf8");
const quotaMatch = quotaSource.match(/DEFAULT_QUOTA_MB\s*=\s*(\d+)\s*\*\s*1024\b/);
if (!quotaMatch) {
  console.error(
    "Could not read DEFAULT_QUOTA_MB from src/lib/quota.ts. If its shape " +
      "changed, update this check — do not delete it.",
  );
  process.exit(1);
}
const codeQuotaMb = Number(quotaMatch[1]) * 1024;

const quotaVars = [
  ["top level (production)", json.vars?.MEMBER_STORAGE_QUOTA_MB],
  ["env.staging", json.env?.staging?.vars?.MEMBER_STORAGE_QUOTA_MB],
];

const disagreeing = quotaVars.filter(
  ([, value]) => value !== undefined && Number(value) !== codeQuotaMb,
);

if (disagreeing.length > 0) {
  for (const [where, value] of disagreeing) {
    console.error(
      `wrangler.jsonc ${where}: MEMBER_STORAGE_QUOTA_MB is ${value}, but ` +
        `DEFAULT_QUOTA_MB in src/lib/quota.ts is ${codeQuotaMb}. The variable ` +
        `wins at runtime, so the deployed quota would be ${value} MB.`,
    );
  }
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      bindings: Object.keys(required),
      memberStorageQuotaMb: codeQuotaMb,
      gitLfsSkipRecommended: true,
    },
    null,
    2,
  ),
);
