/**
 * V-LISTEN — a reader listens to an article, leaves, and comes back to it.
 *
 * ONLY THE RESUME HALF EXISTS YET. The follow-the-text half (highlight,
 * detach, sticky player) belongs to a later change and is not in this file.
 *
 * WHY A BROWSER TEST WHEN `U-RESUME` COVERS THE RULES. Those prove what to do
 * with a number. They cannot see whether the player's events reach them, whether
 * the notice renders after hydration without upsetting it, or — the one this
 * exists for — whether the position is still there after the reader LEAVES BY
 * CLICKING. Leaving by a link is a soft navigation: the page is unmounted, not
 * unloaded, so `pagehide` never fires and only the component's own cleanup
 * saves anything. A test that navigated with `goto` would take the other path
 * and could not tell.
 *
 * THE AUDIO IS A STAND-IN. Local R2 holds the fixture
 * `scripts/seed-e2e-narration.ts` put there, so the page renders the player;
 * the browser is then handed the same bytes by `page.route`. That is needed
 * because the `src` the page renders depends on where the run is: in CI
 * `R2_PUBLIC_URL` is unset (the shards set neither it nor an env file) and the
 * URL is `/article-audio/<key>.mp3` on the dev server, which has no such
 * route; on a laptop `.env.local` points it at the production CDN. One glob
 * matches both. The handler honours `Range`, as R2 does — a browser that
 * cannot range-request cannot seek in a file it has not finished downloading.
 *
 * WHAT PLAYWRIGHT CANNOT DO, so what this does instead. The `<audio>` is the
 * browser's own control: its play button and scrub bar live in a closed UA
 * shadow root that no locator reaches. So the test calls `play()` and sets
 * `currentTime` on the element. Those are the exact calls the native controls
 * make, and they raise the same events the component listens to (`play`,
 * `seeked`, `pause`). `play()` is muted because Chromium refuses an unmuted
 * `play()` with no user gesture, and a muted element is exempt.
 */
import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";

import type { Dictionary } from "@/lib/i18n/dictionary";
import { localizedPath } from "@/lib/i18n/locales";
import { POSITIONS_STORAGE_KEY } from "@/lib/reader/narration-position";

import {
  NARRATED_SLUG,
  NARRATION_DURATION_SECONDS,
  NARRATION_FILE,
} from "../fixtures/narration";
import { budget } from "../helpers/budget";
import { waitForHydration } from "../helpers/hydration";
import { expect, test } from "../helpers/test";

const MP3 = readFileSync(NARRATION_FILE);

/**
 * Read rather than imported, as `e2e/unit/dictionary.spec.ts` explains: the
 * loader here is ESM, where a JSON import needs an attribute that typecheck
 * does not ask for. The Simplified copy, so the journey fails if the page
 * shows the Traditional wording on the Simplified site.
 */
const hans: Dictionary = JSON.parse(
  readFileSync("src/dictionaries/zh-Hans.json", "utf8"),
);

/** 1×1 transparent GIF — article bodies are full of CDN images the sandbox cannot route. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

/** The Simplified site: also proves the key, and so the position, is shared across scripts. */
const ARTICLE = localizedPath("zh-hans", `/${NARRATED_SLUG}`);

/** Where in the 120 s file the reader stops. Not on a whole second: the notice rounds down. */
const STOP_AT = 42.2;

async function serveNarration(page: Page) {
  await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
    route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
  );
  await page.route("**/article-audio/*.mp3", (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(
      route.request().headers()["range"] ?? "",
    );
    const headers = { "accept-ranges": "bytes" };
    if (!range) {
      return route.fulfill({ status: 200, contentType: "audio/mpeg", headers, body: MP3 });
    }
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), MP3.length - 1) : MP3.length - 1;
    return route.fulfill({
      status: 206,
      contentType: "audio/mpeg",
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${MP3.length}` },
      body: MP3.subarray(start, end + 1),
    });
  });
}

/** Leave by clicking the article's own "all articles" link, then come back by clicking its card. */
async function leaveAndReturn(page: Page) {
  await page
    .getByRole("link", { name: hans.posts.seeAll, exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`${localizedPath("zh-hans", "/posts")}$`), {
    timeout: budget(20_000),
  });
  // The card's own link, matched whole. A suffix match also catches the
  // card's print link (`/print/posts/2024/my-ultra-races`), `.first()` took
  // it on CI, and the journey ended up on the print page. The card renders
  // `postPublicPath(slug)` through `LocaleLink`, which prefixes the language
  // the reader is on — the same address as `ARTICLE`.
  await page.locator(`a[href="${ARTICLE}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`${ARTICLE}$`), {
    timeout: budget(20_000),
  });
}

test.describe("V-LISTEN a reader comes back to where they stopped", () => {
  test("V-LISTEN-T1: leaving by a link and returning offers the place, and play continues from it", async ({
    page,
  }) => {
    // Two article renders, a list page and two more soft navigations, on a
    // dev server compiling on demand.
    test.setTimeout(budget(90_000));
    await serveNarration(page);

    await page.goto(ARTICLE, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const player = page.getByTestId("article-audio-player");
    const notice = page.getByTestId("article-audio-resume");
    await expect(
      player,
      `${NARRATED_SLUG} rendered no player — local R2 has no narration under its key; run pnpm seed:e2e:narration`,
    ).toBeVisible({ timeout: budget(20_000) });

    // A first visit has nothing to resume, and so fetches nothing: this is
    // the server's render, kept by the browser's.
    await expect(notice).toHaveCount(0);
    await expect(player).toHaveAttribute("preload", "none");

    // Listen, then stop partway through.
    await player.evaluate(async (audio: HTMLAudioElement) => {
      audio.muted = true;
      await audio.play();
    });
    await expect
      .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.duration), {
        message:
          "the player never loaded the fixture — the page.route glob did not match the src it rendered",
        timeout: budget(10_000),
      })
      .toBeCloseTo(NARRATION_DURATION_SECONDS, 0);
    await player.evaluate(
      (audio: HTMLAudioElement, at: number) =>
        new Promise<void>((resolve) => {
          audio.addEventListener(
            "seeked",
            () => {
              audio.pause();
              resolve();
            },
            { once: true },
          );
          audio.currentTime = at;
        }),
      STOP_AT,
    );
    await expect
      .poll(
        () => page.evaluate((k) => window.localStorage.getItem(k), POSITIONS_STORAGE_KEY),
        { message: "nothing was remembered before the reader left" },
      )
      .toContain(`"t":${Math.floor(STOP_AT)}`);

    await leaveAndReturn(page);

    // The offer, in the language of the page, naming the second they stopped.
    await expect(player).toBeVisible({ timeout: budget(20_000) });
    await expect(notice).toHaveText(
      new RegExp(
        `^${hans.reader.resumeNotice.replace("{time}", "0:42")}\\s*${hans.reader.resumeRestart}$`,
      ),
      { timeout: budget(10_000) },
    );
    // Only a returning reader gets the first bytes.
    await expect(player).toHaveAttribute("preload", "metadata");

    // Pressing play carries on from there, rather than from the start.
    await player.evaluate(async (audio: HTMLAudioElement) => {
      audio.muted = true;
      await audio.play();
    });
    await expect
      .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.currentTime), {
        message: "play started from the beginning instead of from the remembered place",
        timeout: budget(10_000),
      })
      .toBeGreaterThanOrEqual(Math.floor(STOP_AT));
    await expect(notice).toHaveCount(0);

    // And the other button: leave again, and start over instead.
    await player.evaluate((audio: HTMLAudioElement) => audio.pause());
    await leaveAndReturn(page);
    await expect(notice).toBeVisible({ timeout: budget(10_000) });
    await page.getByTestId("article-audio-restart").click();
    await expect(notice).toHaveCount(0);
    await expect
      .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.currentTime))
      .toBe(0);
  });
});
