import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Generated output, none of it authored here. All gitignored, but flat
    // config does not read .gitignore, so eslint walks into them.
    //
    // HONEST CAVEAT: adding these does NOT fix `pnpm lint`, which still runs
    // the heap out of memory on this repo — something else in the tree is
    // doing it and finding out was out of scope. `npx eslint src scripts e2e`
    // works and is what to use meanwhile. CI does not run lint at all, which
    // is why nobody noticed.
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
      "reports/**",
      ".wrangler/**",
      ".open-next/**",
    ],
  },
];

export default eslintConfig;
