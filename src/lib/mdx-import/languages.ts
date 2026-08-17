import type { ImportWarning } from "./types";

/**
 * Maps a fenced code block's info-string language to one of the values
 * Payload's `CodeBlock` actually offers.
 *
 * `CodeBlock()` (`@payloadcms/richtext-lexical`) builds its `language`
 * field as a `select` whose options are the keys of `defaultLanguages`
 * (Monaco's language list) — verified by reading
 * `node_modules/@payloadcms/richtext-lexical/dist/features/blocks/premade/
 * CodeBlock/Component/defaultLanguages.js`. That list has `javascript`,
 * `typescript`, `shell`, `python`, `plaintext`, `yaml`, `markdown`, … but
 * NOT the common fence shorthands `js`, `ts`, `sh`, `bash`, `py`, `yml`,
 * `md`.
 *
 * Payload's `select` validator does reject an out-of-list string in
 * general (`node_modules/payload/dist/fields/validations.js`), but
 * measured directly against this collection — a real `POST /api/posts`
 * with `language: "js"` — the save succeeded anyway; `blockValidationHOC`
 * (`@payloadcms/richtext-lexical/dist/features/blocks/server/validate.js`)
 * did not refuse it. So this mapping is not a save-refusal guard. It
 * exists for a smaller, still real reason: `/admin`'s own block editor
 * renders `language` as this same select, and a value outside its option
 * list shows as an unrecognised, unclickable entry there — an admin
 * revisiting an imported post to fix formatting would find the language
 * picker broken. Normalizing to a real key keeps that editable.
 *
 * Falls back to `"plaintext"` — a real key — rather than omitting the
 * field: the block's own `defaultValue` is `Object.keys(languages)[0]`,
 * which is `"abap"`, so leaving it unset does not mean "unset", it means
 * "abap".
 */

// The verified key set from defaultLanguages.js, kept as a plain list
// (not imported) so this module has no dependency on Payload internals.
const KNOWN_LANGUAGES = new Set([
  "abap", "apex", "azcli", "bat", "bicep", "cameligo", "clojure", "coffee",
  "cpp", "csharp", "csp", "css", "cypher", "dart", "dockerfile", "ecl",
  "elixir", "flow9", "freemarker2", "fsharp", "go", "graphql", "handlebars",
  "hcl", "html", "ini", "java", "javascript", "julia", "kotlin", "less",
  "lexon", "liquid", "lua", "m3", "markdown", "mdx", "mips", "msdax",
  "mysql", "objective-c", "pascal", "pascaligo", "perl", "pgsql", "php",
  "pla", "plaintext", "postiats", "powerquery", "powershell", "protobuf",
  "pug", "python", "qsharp", "r", "razor", "redis", "redshift",
  "restructuredtext", "ruby", "rust", "sb", "scala", "scheme", "scss",
  "shell", "solidity", "sophia", "sparql", "sql", "st", "swift",
  "systemverilog", "tcl", "twig", "typescript", "typespec", "vb", "wgsl",
  "xml", "yaml",
]);

const ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  console: "shell",
  py: "python",
  yml: "yaml",
  md: "markdown",
  "c++": "cpp",
  "c#": "csharp",
  objc: "objective-c",
};

const FALLBACK = "plaintext";

export function codeLanguage(fence: string | null | undefined): {
  language: string;
  warning: ImportWarning | null;
} {
  const raw = (fence ?? "").trim().toLowerCase();
  if (raw === "") return { language: FALLBACK, warning: null };

  const aliased = ALIASES[raw] ?? raw;
  if (KNOWN_LANGUAGES.has(aliased)) {
    return { language: aliased, warning: null };
  }

  return {
    language: FALLBACK,
    warning: {
      code: "unknown-code-language",
      message: `不認得的程式碼語言「${raw}」，已改為純文字`,
      detail: raw,
    },
  };
}
