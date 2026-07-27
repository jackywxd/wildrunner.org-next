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

console.log(
  JSON.stringify(
    {
      ok: true,
      bindings: Object.keys(required),
      gitLfsSkipRecommended: true,
    },
    null,
    2,
  ),
);
