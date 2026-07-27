#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const attributes = fs.readFileSync(path.join(root, ".gitattributes"), "utf8");
const workersBuilds = fs.readFileSync(
  path.join(root, "docs/workers-builds.md"),
  "utf8",
);

if (!workersBuilds.includes("Git LFS") || !workersBuilds.includes("关闭")) {
  console.error("docs/workers-builds.md must document LFS disabled");
  process.exit(1);
}

if (!workersBuilds.includes("payload migrate")) {
  console.error("docs/workers-builds.md must include payload migrate step");
  process.exit(1);
}

// LFS may still track historical paths; Builds must skip smudge.
console.log(
  JSON.stringify(
    {
      ok: true,
      gitattributesHasLfs: /filter=lfs/.test(attributes),
      buildsDocumentsSkipLfs: true,
    },
    null,
    2,
  ),
);
