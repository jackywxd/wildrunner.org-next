import { apiTest as test, expect } from "../helpers/api-test";
import { budget } from "../helpers/budget";

/**
 * X-OG — every public route says who it is when it is shared.
 *
 * THIS IS THE TEST THAT DID NOT EXIST, and its absence is why the audit of
 * 2026-09-03 found five separate faults at once. The two og specs that were
 * here (`post-og.spec.ts`, `og-photo.spec.ts`) are unit tests over the helper
 * functions; not one of them had ever looked at the HTML the site serves. So
 * `/about` shipped with no `openGraph` block at all, the race edition page
 * shipped with one that had no `images`, and four routes shipped cards signed
 * with the site's own name — all green, all invisible.
 *
 * CORPUS-SCOPED, and deliberately so: it asserts about every route that
 * actually exists rather than about fixtures it made. A route added without
 * metadata fails here, which is the whole point — the failure the six
 * hand-written `openGraph` blocks could not produce.
 *
 * API-ONLY. It reads the served markup; there is nothing to click, and the
 * console guard would launch a browser per route for nothing.
 *
 * WHAT IT CAN AND CANNOT CHECK ABOUT THE IMAGE. Card URLs are absolute against
 * `siteConfig.baseURL` — the production origin, because that is what a crawler
 * must be handed. So `/og` cards are re-pointed at whatever origin this run is
 * testing and fetched, which really does exercise the renderer. A photograph
 * on `images.wildrunner.org` is only checked for being a well-formed absolute
 * https URL: fetching it would test Cloudflare's CDN, not this repository, and
 * the CI sandbox cannot route that host at all.
 */

/** Appended once by the root layout's title template, and nowhere else. */
const SITE_NAME = "野馬營";

/** Routes with no parameters — the ones that had four of the five faults. */
const STATIC_ROUTES = [
  "/",
  "/posts",
  "/gallery",
  "/races",
  "/riders",
  "/riders/timeline",
  "/about",
];

type Tags = {
  title?: string;
  description?: string;
  image?: string;
  pageTitle?: string;
};

/** Read the tags out of the served HTML, rather than out of a component. */
function readTags(html: string): Tags {
  const meta = (property: string) =>
    html.match(
      new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`, "i"),
    )?.[1];
  return {
    title: meta("og:title"),
    description: meta("og:description"),
    image: meta("og:image"),
    pageTitle: html.match(/<title>([^<]*)<\/title>/i)?.[1],
  };
}

/** HTML entities Next escapes into attribute values; only these appear here. */
const decode = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");

test.describe("X-OG every public route is shareable", () => {
  test("X-OG-1: every route carries a title, a description and a card", async ({
    request,
    baseURL,
  }) => {
    test.setTimeout(budget(120_000));

    // One real address per dynamic route, resolved from the corpus rather than
    // hardcoded — a spec that hardcodes slugs stops covering the route the day
    // somebody renames one.
    const routes = [...STATIC_ROUTES, ...(await dynamicRoutes(request))];
    expect(
      routes.length,
      "no dynamic routes resolved — the corpus is empty, not the site",
    ).toBeGreaterThan(STATIC_ROUTES.length);

    const faults: string[] = [];

    for (const route of routes) {
      const response = await request.get(route);
      if (!response.ok()) {
        faults.push(`${route}: HTTP ${response.status()}`);
        continue;
      }
      const tags = readTags(await response.text());

      if (!tags.title) faults.push(`${route}: no og:title`);
      if (!tags.description) faults.push(`${route}: no og:description`);
      if (!tags.image) faults.push(`${route}: no og:image`);

      // NOT "og:title contains no `|`" — that assertion was written first and
      // this scan disproved it: the corpus has a post called
      // 「Whistler by UTMB | 2024」, and a member may put a pipe in a title
      // whenever they like. What must not happen is a route appending the site
      // name to its own title, which is what produced four-segment tabs like
      // 「賽事日程 | Race Schedule | 野馬營 | Wild Runner Website」. The card
      // parameters are where the separator actually matters, and X-OG-2 checks
      // those.
      if (tags.title?.includes(`｜${SITE_NAME}`)) {
        faults.push(`${route}: og:title appends the site name — ${tags.title}`);
      }
      if (tags.pageTitle?.includes("Wild Runner Website")) {
        faults.push(`${route}: tab title still ends in the old English suffix`);
      }
    }

    expect(faults, faults.join("\n")).toEqual([]);
  });

  test("X-OG-2: the generated cards actually render", async ({
    request,
    baseURL,
  }) => {
    test.setTimeout(budget(120_000));
    const routes = [...STATIC_ROUTES, ...(await dynamicRoutes(request))];
    const origin = new URL(baseURL ?? "http://localhost:3000").origin;

    let rendered = 0;
    const faults: string[] = [];

    for (const route of routes) {
      const response = await request.get(route);
      if (!response.ok()) continue;
      const raw = readTags(await response.text()).image;
      if (!raw) continue;

      const image = new URL(decode(raw));
      if (!image.pathname.startsWith("/og")) {
        // A photograph. Well-formed and absolute is all this run can say — see
        // the header.
        if (image.protocol !== "https:") {
          faults.push(`${route}: og:image is not https — ${image.href}`);
        }
        continue;
      }

      // Re-pointed at this run's origin: the URL a crawler gets names
      // production, and a local run cannot fetch that.
      const local = new URL(image.pathname + image.search, origin);
      const card = await request.get(local.href);
      if (!card.ok()) {
        faults.push(`${route}: card ${local.search} answered ${card.status()}`);
        continue;
      }
      const type = card.headers()["content-type"] ?? "";
      if (!type.startsWith("image/")) {
        faults.push(`${route}: card answered ${type}, not an image`);
      }

      // THE ONE THAT DISARMS THE SPLIT. `/og` reads the last `|` of `title` as
      // a byline separator, and only skips that when the caller says what the
      // byline is. Every card we generate must therefore carry a `subtitle` —
      // asserted here on the URL the site really served, not on a function's
      // return value.
      if (!image.searchParams.has("subtitle")) {
        faults.push(
          `${route}: card has no subtitle, so /og splits its title on "|"`,
        );
      }
      const cardTitle = image.searchParams.get("title") ?? "";
      if (cardTitle.includes("|")) {
        faults.push(`${route}: card title carries a separator — ${cardTitle}`);
      }
      rendered += 1;
    }

    expect(faults, faults.join("\n")).toEqual([]);
    expect(
      rendered,
      "no generated card was fetched — the scan found only photographs, so it proved nothing about /og",
    ).toBeGreaterThan(0);
  });
});

/**
 * One live address per dynamic route.
 *
 * Anything the corpus cannot supply is left out rather than faked: a missing
 * subject is a seeding problem, and `X-OG-1` fails on the total instead, which
 * names it more clearly than a 404 would.
 */
async function dynamicRoutes(
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

  const media = await json(
    "/api/media?limit=1&depth=0&where[usage][equals]=gallery",
  );
  const mediaId = media.docs?.[0]?.id as number | undefined;
  if (mediaId) routes.push(`/gallery/m/${mediaId}`);

  // Members only: an author with no account is a legacy byline with no page.
  const riders = await json(
    "/api/authors?limit=1&depth=0&where[owner][exists]=true",
  );
  const riderSlug = riders.docs?.[0]?.slug as string | undefined;
  if (riderSlug) {
    routes.push(`/riders/${riderSlug}`, `/riders/${riderSlug}/timeline`);
  }

  const editions = await json("/api/race-editions?limit=1&depth=1");
  const edition = editions.docs?.[0] as
    | { year?: number; event?: { key?: string } }
    | undefined;
  if (edition?.event?.key && edition.year) {
    routes.push(`/races/${edition.event.key}/${edition.year}`);
  }

  return routes;
}
