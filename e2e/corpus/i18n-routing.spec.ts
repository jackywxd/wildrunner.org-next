import { apiTest as test, expect } from "../helpers/api-test";
import { budget } from "../helpers/budget";
import { LOCALES, localizedPath } from "@/lib/i18n/locales";

/**
 * X-I18N — the language seam, from outside.
 *
 * `(site)` lives under a `[lang]` root segment and `next.config.ts` rewrites
 * every unprefixed address to the default language. The whole point of that
 * arrangement is that it is **invisible**: the site is published at exactly
 * the addresses it was published at yesterday, and the URLs already printed
 * into share cards, PDFs and other people's chat histories keep working —
 * and a second language arrives beside them without moving any of it.
 *
 * EVERY ROUTE IS CHECKED IN EVERY PUBLISHED LANGUAGE, from `LOCALES`. Reading
 * the list rather than naming the languages is what makes the third language
 * arrive already covered instead of arriving with a test that still knows
 * about two.
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

/**
 * Languages this site is not published in.
 *
 * `[lang]` is one dynamic segment, so it matches any first segment at all,
 * and every language nobody has written would otherwise become a duplicate
 * copy of the whole site for a crawler to index.
 *
 * `/en` USED TO BE ON THIS LIST and has moved to the published side, which is
 * the point of keeping the two lists apart: adding a language is one entry in
 * `LOCALES`, and this list is what still says no to the rest. `/zh-TW` is
 * here on purpose — it is a plausible thing to type, it is not what this site
 * publishes (`locales.ts` explains why the tags are script tags), and a
 * dynamic segment would happily serve it.
 * The rewrites in `next.config.ts` cannot refuse those: they only add a
 * prefix where one is missing. The layout does, and this is what says so.
 */
/**
 * `/en` IS BACK IN THIS LIST, and that is the point of the list. The English
 * interface shipped and was taken out again — no English content ever existed
 * behind it — so `/en/...` must 404 like any other language this site is not
 * published in. A removal that left the route answering would be invisible
 * from the two languages that remain.
 */
const UNPUBLISHED = ["/en", "/en/posts", "/zh-cn/gallery", "/zh-TW", "/fr", "/de/posts"];

const htmlLang = (body: string) =>
  body.match(/<html[^>]*\blang="([^"]*)"/)?.[1] ?? null;

test.describe("X-I18N the language seam is invisible from outside", () => {
  test("X-I18N-1: every public address still answers where it always did", async ({
    request,
  }) => {
    test.setTimeout(budget(300_000));

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
      for (const { segment, tag } of LOCALES) {
        const address = localizedPath(segment, route);
        const response = await request.get(address, { maxRedirects: 0 });
        if (response.status() !== 200) {
          faults.push(`${address}: answered ${response.status()}, not 200`);
          continue;
        }
        const lang = htmlLang(await response.text());
        if (lang !== tag) {
          faults.push(
            `${address}: <html lang> is ${lang ?? "<missing>"}, expected ${tag}`,
          );
        }
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
    for (const path of UNPUBLISHED) {
      const response = await request.get(path, { maxRedirects: 0 });
      if (response.status() !== 404) {
        faults.push(
          `${path}: answered ${response.status()} — a language this site is not published in must not have a page`,
        );
      }
    }

    expect(faults, faults.join("\n")).toEqual([]);
  });

  test("X-I18N-3: every page advertises exactly the languages it exists in", async ({
    request,
  }) => {
    test.setTimeout(budget(180_000));

    // WHY THIS IS ITS OWN ASSERTION. A second language that nothing points at
    // is a second language no reader and no crawler can find, and the failure
    // is silent in both directions: an `hreflang` naming a language the site
    // does not publish sends a crawler to a 404 and earns a soft-404 penalty
    // for the page that named it, while a missing one leaves the translation
    // unindexed. Neither shows up on the page.
    //
    // The canonical matters as much: pointing the Simplified page at the
    // Traditional one asks a crawler to drop it as a duplicate, which is the
    // opposite of what a translation is.
    const faults: string[] = [];
    const expected = new Set([
      ...LOCALES.map(({ tag }) => tag),
      "x-default",
    ]);

    for (const route of PUBLIC_ROUTES) {
      for (const { segment } of LOCALES) {
        const address = localizedPath(segment, route);
        const body = await (await request.get(address)).text();

        const canonical = body.match(
          /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/,
        )?.[1];
        if (!canonical?.endsWith(address === "/" ? "" : address)) {
          faults.push(
            `${address}: canonical is ${canonical ?? "<missing>"} — a page's canonical must be its own address`,
          );
        }

        const advertised = new Map(
          [...body.matchAll(/<link[^>]+hrefLang="([^"]+)"[^>]+href="([^"]+)"/g)].map(
            (match) => [match[1], match[2]],
          ),
        );
        for (const missing of [...expected].filter((k) => !advertised.has(k))) {
          faults.push(`${address}: no hreflang for ${missing}`);
        }
        for (const extra of [...advertised.keys()].filter((k) => !expected.has(k))) {
          faults.push(
            `${address}: advertises ${extra}, which this site does not publish`,
          );
        }
        for (const { segment: other, tag: otherTag } of LOCALES) {
          const href = advertised.get(otherTag);
          const wanted = localizedPath(other, route);
          if (href && !href.endsWith(wanted === "/" ? "" : wanted)) {
            faults.push(`${address}: hreflang ${otherTag} points at ${href}`);
          }
        }
      }
    }

    expect(faults, faults.join("\n")).toEqual([]);
  });

  test("X-I18N-4: the sitemap enumerates the corpus in every language", async ({
    request,
  }) => {
    test.setTimeout(budget(60_000));

    // A sitemap is the one file whose entire job is enumeration, which is
    // also the one kind of failure nothing else notices: if the query behind
    // it returned nothing, `/sitemap.xml` would still answer 200 with a
    // well-formed, empty `<urlset>` and every other test here would stay
    // green. So this counts, and it counts against the corpus rather than
    // against a number typed here.
    const response = await request.get("/sitemap.xml");
    expect(response.status(), "/sitemap.xml did not answer").toBe(200);
    const body = await response.text();

    const posts = await request.get(
      "/api/posts?limit=0&depth=0&where[_status][equals]=published",
    );
    const published = ((await posts.json()) as { totalDocs?: number }).totalDocs ?? 0;
    expect(published, "no published posts — the corpus is empty").toBeGreaterThan(0);

    // Per `<url>` block rather than by slicing a window out of the document:
    // the block is what the format actually groups, and a fixed window would
    // start being too short the day a third language is added.
    const entries = [...body.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => ({
      loc: match[1].match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "",
      block: match[1],
    }));

    // corpus-scoped: every published article must be in the sitemap, so this
    // is a claim about the whole result set and not about a fixture.
    const articles = entries.filter(({ loc }) => /\/posts\/.+/.test(loc));
    expect(
      articles.length,
      `sitemap lists ${articles.length} articles, the database has ${published}`,
    ).toBe(published);

    // And each entry carries every published language, which is the half a
    // crawler reads to pair the translations.
    const faults = entries
      .filter(({ block }) =>
        LOCALES.some(({ tag }) => !block.includes(`hreflang="${tag}"`)),
      )
      .map(({ loc }) => loc);
    expect(faults, `entries missing a language:\n${faults.join("\n")}`).toEqual([]);
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
