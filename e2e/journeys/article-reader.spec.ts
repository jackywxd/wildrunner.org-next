/**
 * V-READER — a visitor listens to an article instead of reading it.
 *
 * WHAT THIS PLATFORM CAN AND CANNOT SHOW, measured rather than assumed:
 * headless Chromium has `speechSynthesis` and **zero voices**
 * (`{"hasApi":true,"voices":0}`). Nothing here can hear anything, and no
 * amount of test design changes that.
 *
 * So the two halves are split by what is real. T1 runs against the platform as
 * it actually is — no voices — because that is not a testing compromise but a
 * state real visitors are in: a stripped Android, a locked-down desktop. The
 * control must say so rather than sit there looking pressable, which is this
 * codebase's oldest failure mode.
 *
 * T2 substitutes a voice engine, and is careful about what that buys. It does
 * NOT mock the component or `articleSegments` — what the article reduces to is
 * proved in the unit lane over the real corpus. It replaces the one thing this
 * machine does not have, and then asserts our own wiring: that the title is
 * said first, and that 停止 actually stops. The second is worth a test because
 * `cancel()` fires `onend` on the utterance it cancelled — so a naive chain
 * carries on speaking after the visitor asked it to stop, and the stub models
 * that exactly.
 */
import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";

/** 1×1 transparent GIF, answered in-process so no request leaves the sandbox. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

/**
 * Article bodies are full of absolute images.wildrunner.org URLs the sandbox
 * cannot route, and the console guard is right to fail on them. Same
 * interception every spec that renders corpus media needs.
 */
async function stubImages(page: import("@playwright/test").Page) {
  await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
    route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
  );
}

/** A voice engine, standing in for the one this machine does not have. */
async function stubVoice(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    let current: { onend?: ((event: Event) => void) | null } | null = null;
    const voice = {
      name: "測試語音",
      lang: "zh-TW",
      default: true,
      localService: true,
      voiceURI: "test",
    };
    (window as unknown as { __spoken: string[] }).__spoken = spoken;

    // `SpeechSynthesisUtterance` IS REPLACED TOO, and finding out why is the
    // useful part: Chromium refuses a plain object for `utterance.voice`
    // ("Failed to convert value to 'SpeechSynthesisVoice'"), and the throw
    // killed the chain mid-run. The real class only accepts a voice that came
    // from the real `getVoices()`, which this machine has none of. Stubbing
    // the engine therefore means stubbing both halves of it — the alternative
    // was a try/catch in the component guarding against something that cannot
    // happen in a browser, which is exactly the defensive code CLAUDE.md says
    // not to write.
    class StubUtterance {
      text: string;
      voice: unknown = null;
      rate = 1;
      lang = "";
      onend: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: StubUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => [voice],
        speak(utterance: {
          text: string;
          onend?: ((event: Event) => void) | null;
        }) {
          spoken.push(utterance.text);
          current = utterance;
          // Finishes on the next tick, so the chain advances the way a real
          // engine's would.
          // LONG ENOUGH TO STILL BE SPEAKING when the test presses stop. At
          // five milliseconds the stub read a whole article between two
          // assertions, the reader returned to idle on its own, and the 停止
          // button had already unmounted — the run looked like a missing
          // control when it was a finished one.
          setTimeout(() => {
            if (current !== utterance) return;
            current = null;
            utterance.onend?.(new Event("end"));
          }, 60);
        },
        cancel() {
          // THE REAL BEHAVIOUR, and the reason the reader keeps an epoch:
          // cancelling fires `onend` on what was cancelled. A chain that
          // trusts `onend` speaks the NEXT sentence here — after the visitor
          // pressed stop.
          const utterance = current;
          current = null;
          utterance?.onend?.(new Event("end"));
        },
        pause() {},
        resume() {},
        addEventListener() {},
        removeEventListener() {},
      },
    });
  });
}

/**
 * The wordiest published article.
 *
 * Not "the first one": a post whose body is mostly photographs reduces to two
 * or three sentences, and this journey has to still be speaking when it
 * presses stop. Chosen by body size so the choice is deterministic and does
 * not depend on which post the corpus happens to return first.
 */
async function longestArticle(
  request: import("@playwright/test").APIRequestContext,
) {
  const res = await request.get(
    "/api/posts?limit=50&depth=0&where[_status][equals]=published",
  );
  expect(res.ok(), `could not read posts: ${res.status()}`).toBeTruthy();
  const docs = ((await res.json()).docs ?? []) as {
    id: number;
    slug: string;
    title: string;
    content?: unknown;
    musicUrl?: string | null;
  }[];
  const withBody = docs
    .filter((doc) => doc.content)
    .sort(
      (a, b) =>
        JSON.stringify(b.content).length - JSON.stringify(a.content).length,
    );
  expect(
    withBody[0],
    "the seeded corpus has 15 posts with bodies — reseed with pnpm db:reset:local",
  ).toBeTruthy();
  return withBody[0];
}

test.describe("V-READER an article can be listened to", () => {
  test("V-READER-T1: with no voice on the device it says so, instead of a dead button", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));
    const post = await longestArticle(request);

    await stubImages(page);
    await page.goto(`/posts/${post.slug}`, { waitUntil: "domcontentloaded" });

    const reader = page.getByTestId("article-reader");
    await expect(
      reader,
      "the control renders wherever the API exists",
    ).toBeVisible({
      timeout: budget(20_000),
    });

    // This machine has zero voices, which is also a real device's state.
    await expect(page.getByTestId("article-reader-no-voice")).toBeVisible();
    await expect(page.getByTestId("article-reader-toggle")).toBeDisabled();
    // No voice means no choice to offer; an empty menu would be its own lie.
    await expect(page.getByTestId("article-reader-voice")).toHaveCount(0);
  });

  test("V-READER-T2: it says the title first, and 停止 really stops", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));
    const post = await longestArticle(request);

    await stubImages(page);
    await stubVoice(page);
    await page.goto(`/posts/${post.slug}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("article-reader")).toBeVisible({
      timeout: budget(20_000),
    });
    // A voice exists now, so the choice is offered and the button works.
    await expect(page.getByTestId("article-reader-no-voice")).toHaveCount(0);
    await expect(page.getByTestId("article-reader-voice")).toBeVisible();

    await page.getByTestId("article-reader-toggle").click();

    // The title first: a listener has to know what they are hearing.
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { __spoken: string[] }).__spoken[0],
          ),
        { timeout: budget(15_000) },
      )
      .toBe(post.title);

    // ...and it keeps going by itself, which is the chain working.
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { __spoken: string[] }).__spoken.length,
          ),
        { timeout: budget(15_000) },
      )
      .toBeGreaterThan(1);

    await page.getByTestId("article-reader-stop").click();
    const atStop = await page.evaluate(
      () => (window as unknown as { __spoken: string[] }).__spoken.length,
    );

    // Nothing more is said. Without the epoch guard, `cancel()`'s own `onend`
    // starts the next sentence and this count keeps climbing.
    await expect(page.getByTestId("article-reader")).toHaveAttribute(
      "data-status",
      "idle",
    );
    await page.waitForTimeout(300);
    expect(
      await page.evaluate(
        () => (window as unknown as { __spoken: string[] }).__spoken.length,
      ),
      "stopping must end the article, not pause it for one sentence",
    ).toBe(atStop);
  });
});

/**
 * V-READERMUSIC — the article plays the same background music an album does.
 *
 * THE CORPUS HAS NO POST MUSIC and the site's fallback list is empty, so every
 * seeded article resolves to silence and the controls do not render at all.
 * That is the correct default and it is why this fixture sets one: the claim
 * is about what happens when there IS a track, and a test that waited for the
 * corpus to grow one would assert nothing today.
 *
 * The field is restored in `afterEach` by the id captured when it was set —
 * never by matching a value, per AGENTS.md.
 */
test.describe("V-READERMUSIC an article read aloud can have music behind it", () => {
  /** Eleven characters, and never anything else — see src/lib/youtube.ts. */
  const VIDEO_ID = "dQw4w9WgXcQ";

  let touched: { id: number; musicUrl: string | null } | null = null;

  test.afterEach(async ({ request }) => {
    if (!touched) return;
    const { id, musicUrl } = touched;
    touched = null;
    // Put back exactly what was there, which for every seeded post is null.
    await request.patch(`/api/posts/${id}`, { data: { musicUrl } });
  });

  async function giveItMusic(
    request: import("@playwright/test").APIRequestContext,
    post: { id: number; musicUrl?: string | null },
  ) {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();
    touched = { id: post.id, musicUrl: post.musicUrl ?? null };
    const patched = await request.patch(`/api/posts/${post.id}`, {
      data: { musicUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}` },
    });
    expect(
      patched.ok(),
      `could not set the music: ${patched.status()}`,
    ).toBeTruthy();
  }

  test("V-READERMUSIC-T1: music follows the voice, and the toggle silences it", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));
    const post = await longestArticle(request);
    await giveItMusic(request, post);

    await stubImages(page);
    await stubVoice(page);
    await page.goto(`/posts/${post.slug}`, { waitUntil: "domcontentloaded" });

    // Nothing is playing before anybody asks for it: the player exists only
    // while the article is actually being read.
    await expect(page.getByTestId("article-reader")).toBeVisible({
      timeout: budget(20_000),
    });
    await expect(page.getByTestId("slideshow-music")).toHaveCount(0);

    await page.getByTestId("article-reader-toggle").click();

    const player = page.getByTestId("slideshow-music");
    await expect(player, "reading starts the music with it").toBeVisible({
      timeout: budget(15_000),
    });
    // The id the page resolved, not the URL that was stored — the whole point
    // of `buildMusicPlaylist` handing back eleven characters.
    await expect(player).toHaveAttribute("data-video-id", VIDEO_ID);

    // PAUSING THE VOICE SILENCES THE MUSIC TOO, and this assertion exists
    // because a deliberate break showed the rest of the test could not see it:
    // widening the condition from "speaking" to "not idle" left every other
    // check green while the music played on under a paused article. A listener
    // who pressed pause wants the whole thing quiet.
    await page.getByTestId("article-reader-toggle").click();
    await expect(page.getByTestId("article-reader")).toHaveAttribute(
      "data-status",
      "paused",
    );
    await expect(page.getByTestId("slideshow-music")).toHaveCount(0);

    // ...and resuming brings it back, which is what makes pause a pause
    // rather than a stop.
    await page.getByTestId("article-reader-toggle").click();
    await expect(page.getByTestId("slideshow-music")).toBeVisible({
      timeout: budget(15_000),
    });

    await page.getByTestId("article-music-toggle").click();
    await expect(
      page.getByTestId("slideshow-music"),
      "muting unmounts the player; that IS how it stops",
    ).toHaveCount(0);

    // ...and the voice carries on, which is the difference between muting the
    // music and stopping the article.
    await expect(page.getByTestId("article-reader")).toHaveAttribute(
      "data-status",
      "speaking",
    );
  });

  test("V-READERMUSIC-T2: a visitor who silenced an album is not asked again here", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));
    const post = await longestArticle(request);
    await giveItMusic(request, post);

    await stubImages(page);
    await stubVoice(page);
    // Exactly what the gallery writes when its mute button is pressed. Set
    // through the same key rather than by driving the slideshow, so this
    // asserts the sharing itself: if the two screens drift apart onto
    // separate keys, this goes red.
    await page.addInitScript(() => {
      window.sessionStorage.setItem("wr:music-muted", "1");
    });
    await page.goto(`/posts/${post.slug}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("article-reader")).toBeVisible({
      timeout: budget(20_000),
    });
    await page.getByTestId("article-reader-toggle").click();

    // Reading starts; music does not.
    await expect(page.getByTestId("article-reader")).toHaveAttribute(
      "data-status",
      "speaking",
    );
    await expect(page.getByTestId("slideshow-music")).toHaveCount(0);
  });
});
