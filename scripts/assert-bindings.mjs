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
 * `MEMBER_STORAGE_QUOTA_MB` must not come back.
 *
 * WHY THIS EXISTS. The member storage quota used to live in four places at
 * once: `DEFAULT_QUOTA_MB` in src/lib/quota.ts, a `var` here in both
 * environments, a hardcoded literal in the Users collection's admin copy, and
 * the dotenv materialised from `secrets.PRODUCTION_DOTENV` at deploy. Only one
 * of them won, and it was not the constant — `defaultQuotaMb()` read the
 * variable and fell back to the constant only when nobody had set it, which
 * was true of local dev and of nowhere else. So raising the constant to 100 GB
 * changed nothing anybody could see: the storage bar went on reading
 * "10.00 GB", which is exactly what a working storage bar looks like. A person
 * looking at the page is what found it.
 *
 * The value is code now and `defaultQuotaMb()` reads nothing else, so a `var`
 * by this name would not be a conflict — it would be worse. It would sit in a
 * reviewed file looking like the setting, and changing it would do nothing at
 * all.
 */
const strayQuotaVars = [
  ["top level (production)", json.vars?.MEMBER_STORAGE_QUOTA_MB],
  ["env.staging", json.env?.staging?.vars?.MEMBER_STORAGE_QUOTA_MB],
].filter(([, value]) => value !== undefined);

if (strayQuotaVars.length > 0) {
  for (const [where, value] of strayQuotaVars) {
    console.error(
      `wrangler.jsonc ${where}: MEMBER_STORAGE_QUOTA_MB is set to ${value}, ` +
        `but nothing reads it — the quota is DEFAULT_QUOTA_MB in ` +
        `src/lib/quota.ts. Remove this var, or change the constant.`,
    );
  }
  process.exit(1);
}

/**
 * Read back so the number appears in the log rather than only in a diff.
 * Parsed rather than imported because this is a `.mjs` script and the constant
 * lives in TypeScript. A shape this cannot read is an error, never a pass — a
 * checker that silently skips is worse than no checker, since its silence
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
