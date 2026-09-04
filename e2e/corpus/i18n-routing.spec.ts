import { apiTest as test, expect } from "../helpers/api-test";
import { budget } from "../helpers/budget";

/**
 * X-I18N — the language seam, from outside.
 *
 * `(site)` now lives under a `[lang]` root segment and `proxy.ts` rewrites
 * every unprefixed address to the default language. The whole point of that
 * arrangement is that it is **invisible**: the site is published at exactly
 * the addresses it was published at yesterday, and the URLs already printed
 * into share cards, PDFs and other people's chat histories keep working.
 *
 * A rewrite that quietly became a redirect, a segment that started matching
 * a path it must not, or a language that stopped reaching `<html lang>`
 * would each break that silently — the page would still render, and every
 * assertion about its content would still pass. So this asserts about the
 * three things a rewrite can get wrong and nothing else does: the status,
 * the final URL, and the document language.
 *
 * API-ONLY. There is nothing to click.
 */

/** Public addresses with no parameters — the ones a reader types or shares. */
const PUBLIC_ROUTES = [
  "/",
  "/posts",
  "/gallery",
  "/races",
  "/riders",
  "/riders/timeline",
  "/about",
];

/**
 * Paths `proxy.ts` must leave alone, and what proves it did.
 *
 * `/admin` is the one that matters. It is Payload's, under its own root
 * layout, and a dynamic segment at the app root is exactly the kind of thing
 * that starts answering for it by accident — the page would still load,
 * because ours renders too, which is why this looks at `lang` rather than at
 * the status. Payload writes `zh-TW` there; our layout writes `zh-Hant`.
 */
const EXEMPT = [
  { path: "/admin", lang: "zh-TW", why: "Payload's own root layout" },
  { path: "/api/riders/timeline?limit=1", lang: null, why: "a JSON handler" },
];

const htmlLang = (body: string) =>
  body.match(/<html[^>]*\blang="([^"]*)"/)?.[1] ?? null;

test.describe("X-I18N the language seam is invisible from outside", () => {
  test("X-I18N-1: every public address still answers where it always did", async ({
    request,
  }) => {
    test.setTimeout(budget(180_000));

    const routes = [...PUBLIC_ROUTES, ...(await oneOfEachDynamicRoute(request))];
    expect(
      routes.length,
      "no dynamic route resolved — the corpus is empty, not the site",
    ).toBeGreaterThan(PUBLIC_ROUTES.length);

    const faults: string[] = [];

    for (const route of routes) {
      // `maxRedirects: 0` is the assertion, not a setting. A redirect here
      // would be the failure this test exists for: it would rewrite every
      // shared link into a language-prefixed one and leave the old address
      // answering 307 forever.
      const response = await request.get(route, { maxRedirects: 0 });
      if (response.status() !== 200) {
        faults.push(`${route}: answered ${response.status()}, not 200`);
        continue;
      }
      const lang = htmlLang(await response.text());
      if (lang !== "zh-Hant") {
        faults.push(`${route}: <html lang> is ${lang ?? "<missing>"}`);
      }
    }

    expect(faults, faults.join("\n")).toEqual([]);
  });

  test("X-I18N-2: the paths outside the site keep their own shell", async ({
    request,
  }) => {
    test.setTimeout(budget(90_000));

    const faults: string[] = [];
    for (const { path, lang, why } of EXEMPT) {
      const response = await request.get(path, { maxRedirects: 0 });
      if (response.status() !== 200) {
        faults.push(`${path}: answered ${response.status()} (${why})`);
        continue;
      }
      const served = htmlLang(await response.text());
      if (served !== lang) {
        faults.push(
          `${path}: <html lang> is ${served ?? "<none>"}, expected ${lang ?? "<none>"} — ${why}`,
        );
      }
    }
    expect(faults, faults.join("\n")).toEqual([]);
  });
});

/**
 * One live address per dynamic route.
 *
 * A dynamic segment is its own compilation unit and its own route match, so
 * `/posts` answering says nothing about `/posts/<slug>` — which is the half
 * of the tree the `[lang]` move could break on its own.
 */
async function oneOfEachDynamicRoute(
  request: import("@playwright/test").APIRequestContext,
): Promise<string[]> {
  const json = async (path: string) => {
    const response = await request.get(path);
    return response.ok() ? await response.json() : { docs: [] };
  };
  const routes: string[] = [];

  const posts = await json(
    "/api/posts?limit=1&depth=0&where[_status][equals]=published",
  );
  const postSlug = posts.docs?.[0]?.slug as string | undefined;
  if (postSlug) routes.push(`/posts/${postSlug.replace(/^posts\//, "")}`);

  const galleries = await json("/api/galleries?limit=1&depth=0");
  const gallerySlug = galleries.docs?.[0]?.slug as string | undefined;
  if (gallerySlug) routes.push(`/gallery/${gallerySlug}`);

  const riders = await json(
    "/api/authors?limit=1&depth=0&where[owner][exists]=true",
  );
  const riderSlug = riders.docs?.[0]?.slug as string | undefined;
  if (riderSlug) routes.push(`/riders/${riderSlug}`);

  return routes;
}
