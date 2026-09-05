import "server-only";
// The generated module. `node_modules/next/root-params.d.ts` is a bare
// `declare module`, so this typechecks before `next typegen` has run — which
// is what CI's `pnpm typecheck` does, with no build in front of it. The cost
// is that `lang` arrives untyped, so it is narrowed here, once.
import { lang } from "next/root-params";

import { DEFAULT_LOCALE, isLocaleSegment, type LocaleSegment } from "./locales";

/**
 * The site's words, for the language the reader asked for.
 *
 * WHY THE STRINGS LEFT THE COMPONENTS. They were spread across the 40 files
 * that now read this as literals, which is fine while there is one language
 * and impossible the moment there are three: a second locale would mean
 * either a second copy of every component or a conditional at every
 * sentence.
 *
 * WHY IT READS THE ROUTE RATHER THAN TAKING A PARAMETER. More than half of
 * the public site's copy lives in Client Components, and React context does
 * not reach Server Components — so neither half can hand the other a
 * dictionary. `next/root-params` gives any Server Component under `[lang]`
 * the locale with no prop-drilling, which is exactly what the Next
 * internationalization guide reaches for; the client half is seeded once by
 * `(public)/layout.tsx` (see `dictionary-provider.tsx`).
 *
 * IT ANSWERS FOR CODE RENDERED OUTSIDE `[lang]` TOO. `lang()` is undefined
 * in a Route Handler and under the other two root layouts — `(print)` and
 * `(payload)` — and a component shared with those must not throw because of
 * where it was rendered. The default locale is the honest answer there: it
 * is the language those pages are written in today.
 */
export type Dictionary = typeof import("../../dictionaries/zh-Hant.json");

/**
 * One dynamic import per locale, so a page ships the language it is in and
 * not the others. `zh-Hans.json` is generated from `zh-Hant.json` by
 * `pnpm generate:zh-hans` and committed — `U-CONVERT-3` fails if the two
 * fall out of step.
 */
const DICTIONARIES: Record<LocaleSegment, () => Promise<Dictionary>> = {
  "zh-hant": () =>
    import("../../dictionaries/zh-Hant.json").then((m) => m.default),
  "zh-hans": () =>
    import("../../dictionaries/zh-Hans.json").then((m) => m.default),
};

export async function getDictionary(): Promise<Dictionary> {
  const segment = await lang();
  const locale =
    typeof segment === "string" && isLocaleSegment(segment)
      ? segment
      : DEFAULT_LOCALE;
  return DICTIONARIES[locale]();
}
