/**
 * OpenNext regenerates `.open-next/assets/_headers` with only `/_next/static/*`.
 * Re-apply long-lived cache for fonts and other hashed public assets before deploy.
 */
import fs from "node:fs";
import path from "node:path";

const headersPath = path.join(process.cwd(), ".open-next/assets/_headers");

const extra = `
# Long-lived cache for OG font and other static fonts
/fonts/*
  Cache-Control: public,max-age=31536000,immutable
`.trimStart();

if (!fs.existsSync(headersPath)) {
  console.warn(`skip patch-assets-headers: missing ${headersPath}`);
  process.exit(0);
}

const current = fs.readFileSync(headersPath, "utf8");
if (current.includes("/fonts/*")) {
  console.log("assets _headers already includes /fonts/*");
  process.exit(0);
}

fs.writeFileSync(headersPath, `${current.trimEnd()}\n\n${extra}\n`);
console.log("patched .open-next/assets/_headers with /fonts/* cache");
