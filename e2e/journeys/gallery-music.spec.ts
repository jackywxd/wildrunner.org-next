import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows } from "../helpers/teardown";

/**
 * V-BGM — an album with background music plays it while its slideshow runs,
 * and stops when asked.
 *
 * WHAT IS ASSERTED AND WHAT DELIBERATELY IS NOT. Whether YouTube emits audio
 * is YouTube's, over the network, and a test that waited for it would be
 * testing the vendor while making the suite depend on reaching
 * youtube-nocookie.com. What is ours is the wiring: the mute control exists,
 * the player is mounted exactly when the slideshow is running, it is built
 * from an id this codebase parsed rather than from a stored string, and it is
 * gone the moment the visitor closes the lightbox or mutes it.
 *
 * That last clause is the one worth a browser. `SlideshowMusic` stops by
 * being unmounted, so "did the music stop" is a DOM question — which is
 * exactly why the component was built that way rather than around a
 * `postMessage` protocol whose silence is indistinguishable from working.
 *
 * The album is created and deleted by this test. Setting `musicUrl` on a
 * corpus album would mean a teardown that restores a previous value, and a
 * teardown that has to put something back is one that leaves the corpus wrong
 * whenever it does not run.
 */

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>',
);

/** The smallest bytes Payload sniffs as video/mp4 — see gallery-videos.spec.ts. */
const MP4_HEADER = Buffer.concat([
  Buffer.from("00000018", "hex"),
  Buffer.from("ftypmp42"),
  Buffer.from("00000000", "hex"),
  Buffer.from("mp42isom"),
  Buffer.alloc(1024),
]);

/** A real, well-formed video id — the parser accepts nothing else. */
const VIDEO_ID = "dQw4w9WgXcQ";
/** Distinct ids so a test can tell *which* source the music came from. */
const EDITION_VIDEO_ID = "aaaaaaaaaaa";
const FALLBACK_VIDEO_ID = "bbbbbbbbbbb";
/** A second and third fallback, for the skip and playlist cases. */
const FALLBACK_TWO = "ccccccccccc";
const FALLBACK_THREE = "ddddddddddd";

/** In the catalogue, and a year no other spec here uses. */
const RACE_EVENT_KEY = "other-barkley";
const RACE_YEAR = 2013;

test.describe("V-BGM an album's slideshow carries its background music", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    // Reversed: the gallery references the media, so it goes first.
    const pending = created.splice(0, created.length).reverse();
    await deleteCreatedRows(request, pending);
  });

  test("V-BGM-T1: the player follows the slideshow, and the mute control stops it", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(90_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: {
          name: `v-bgm-${stamp}.svg`,
          mimeType: "image/svg+xml",
          buffer: SVG,
        },
        _payload: JSON.stringify({ alt: `V-BGM ${stamp}`, usage: "gallery" }),
      },
    });
    expect(uploaded.ok(), `fixture upload failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = ((await uploaded.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "V-BGM probe" });

    const slug = `v-bgm-${stamp}`;
    const album = await request.post("/api/galleries", {
      data: {
        name: `V-BGM ${stamp}`,
        slug,
        _status: "published",
        // The URL, as an admin would paste it. What the page receives is the
        // id parsed back out of it — see U-GALLERYMUSIC.
        musicUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
        items: [{ media: mediaId, featured: false }],
      },
    });
    expect(album.ok(), `gallery create failed: ${await album.text()}`).toBeTruthy();
    const albumId = ((await album.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "galleries", id: albumId });
    recordCreated({ collection: "galleries", id: albumId, note: "V-BGM album" });

    // Both third parties stubbed in-process. The photo for the reason every
    // gallery spec stubs it, and the player because this test makes no claim
    // about YouTube — leaving it live would make a green run depend on the
    // sandbox reaching the internet, and a red one say nothing about us.
    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );
    await page.route(/youtube-nocookie\.com/, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html>" }),
    );

    await page.goto(`/gallery/${slug}`, { waitUntil: "domcontentloaded" });
    // `load`, not `domcontentloaded`: the album's onClick is React's, and a
    // click landing before hydration is silently dropped.
    await page.waitForLoadState("load");
    // Scoped to the album, not `img` on the page: the first image in the
    // document is the header logo, and clicking it navigates home.
    await page.getByTestId("gallery-album").locator("img").first().click();

    const toggle = page.getByTestId("gallery-music-toggle");
    await expect(
      toggle,
      "an album with music must offer a way to silence it — WCAG 1.4.2",
    ).toBeVisible({ timeout: budget(15_000) });

    // Nothing sounds on opening the lightbox. The music is the slideshow's,
    // and a visitor who only wanted to look at one photo hears nothing.
    await expect(toggle).toHaveAttribute("data-playing", "false");
    await expect(page.getByTestId("slideshow-music")).toHaveCount(0);

    await page.getByRole("button", { name: "Play" }).click();

    await expect(toggle).toHaveAttribute("data-playing", "true", {
      timeout: budget(10_000),
    });
    const player = page.getByTestId("slideshow-music");
    await expect(player).toHaveCount(1);
    // Built from the parsed id on the nocookie host — never from the stored
    // URL. This is the assertion that would catch a "simplification" that
    // passed `musicUrl` straight through to the frame.
    await expect(player).toHaveAttribute(
      "src",
      new RegExp(`^https://www\\.youtube-nocookie\\.com/embed/${VIDEO_ID}\\?`),
    );

    /**
     * A tap can actually land on it — the whole reason this player is visible.
     *
     * It began as a 1×1, transparent, `pointer-events: none` frame, which was
     * silent on iOS: that platform grants the right to make sound to a gesture
     * on the media itself and does not pass a parent page's gesture into a
     * cross-origin frame, so the one action it requires could never be
     * performed. Nothing in this suite can hear an iPhone, but it can pin the
     * property that makes the gesture possible at all, and that is the thing a
     * later tidy-up would take away without noticing.
     *
     * `toBeVisible` is not enough on its own: it is satisfied by an element
     * with `opacity: 0`, which is exactly what the broken version was. The
     * size and the hit test are what say "reachable".
     */
    const box = await player.boundingBox();
    expect(box, "the player must have a box to tap").not.toBeNull();
    expect(box!.width, "wide enough to press").toBeGreaterThanOrEqual(100);
    expect(box!.height, "tall enough to press").toBeGreaterThanOrEqual(50);
    const hitsThePlayer = await page.evaluate(
      ([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return Boolean(hit?.closest('[data-testid="slideshow-music-panel"]'));
      },
      [box!.x + box!.width / 2, box!.y + box!.height / 2],
    );
    expect(
      hitsThePlayer,
      "a tap at the player's centre must reach it, not something on top of it",
    ).toBe(true);

    // Muting is not cosmetic: the frame goes away, which is the only way this
    // component can stop a sound it never had a handle on.
    await toggle.click();
    await expect(toggle).toHaveAttribute("data-playing", "false");
    await expect(player).toHaveCount(0);

    // And un-muting starts it again without needing the slideshow pressed a
    // second time — the control a visitor pressed has to do something.
    await toggle.click();
    await expect(page.getByTestId("slideshow-music")).toHaveCount(1);

    // Closing the lightbox is not a pause. Music continuing behind the page
    // would be the worst version of this feature.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("slideshow-music")).toHaveCount(0, {
      timeout: budget(10_000),
    });

    // ...and closing ENDS the slideshow rather than suspending it. Written
    // after the first version of this test failed to notice: the player also
    // unmounts because the lightbox index resets, so asserting only on the
    // close proves nothing about the slideshow's own state. Reopening is
    // where the difference shows — without `exiting` the album starts singing
    // the moment a visitor clicks a photo, which is precisely what the
    // "nothing sounds on opening" rule above forbids.
    await page.getByTestId("gallery-album").locator("img").first().click();
    await expect(toggle).toBeVisible({ timeout: budget(10_000) });
    await expect(toggle).toHaveAttribute("data-playing", "false");
    await expect(page.getByTestId("slideshow-music")).toHaveCount(0);
  });

  test("V-BGM-T2: an album with no music offers no control", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: { name: `v-bgm-none-${stamp}.svg`, mimeType: "image/svg+xml", buffer: SVG },
        _payload: JSON.stringify({ alt: `V-BGM none ${stamp}`, usage: "gallery" }),
      },
    });
    expect(uploaded.ok()).toBeTruthy();
    const mediaId = ((await uploaded.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "V-BGM none probe" });

    const slug = `v-bgm-none-${stamp}`;
    const album = await request.post("/api/galleries", {
      data: {
        name: `V-BGM none ${stamp}`,
        slug,
        _status: "published",
        items: [{ media: mediaId, featured: false }],
      },
    });
    expect(album.ok(), await album.text()).toBeTruthy();
    const albumId = ((await album.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "galleries", id: albumId });
    recordCreated({ collection: "galleries", id: albumId, note: "V-BGM none album" });

    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );

    await page.goto(`/gallery/${slug}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await page.getByTestId("gallery-album").locator("img").first().click();

    // The share button proves the lightbox is open, so the absence below is a
    // real absence rather than a page that never got there — the difference
    // between "no control" and "no lightbox" is invisible to a bare
    // `toHaveCount(0)`.
    await expect(page.getByTestId("gallery-share")).toBeVisible({
      timeout: budget(15_000),
    });
    await expect(page.getByTestId("gallery-music-toggle")).toHaveCount(0);
  });

  test("V-BGM-T3: a race's album takes its music from the edition", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(90_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    // A race album is not a row — it is synthesised from media that carry the
    // tag — so this is the only place the music can live. Three hops between
    // the column and the player (`getRaceEditionsByIds` → `buildRaceGallery` →
    // `MediaGrid`), each of which drops the value in silence if it forgets it.
    const resolved = await request.post("/api/members/race-editions/resolve", {
      data: { eventId: RACE_EVENT_KEY, year: RACE_YEAR },
    });
    expect(resolved.ok(), await resolved.text()).toBeTruthy();
    const editionId = ((await resolved.json()) as { id: number }).id;

    const tagged = await request.patch(`/api/race-editions/${editionId}`, {
      data: { musicUrl: `https://www.youtube.com/watch?v=${EDITION_VIDEO_ID}` },
    });
    expect(tagged.ok(), `edition update failed: ${await tagged.text()}`).toBeTruthy();

    const stamp = Date.now();
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: { name: `v-bgm-race-${stamp}.svg`, mimeType: "image/svg+xml", buffer: SVG },
        _payload: JSON.stringify({
          alt: `V-BGM race ${stamp}`,
          usage: "gallery",
          raceEdition: editionId,
        }),
      },
    });
    expect(uploaded.ok(), `fixture upload failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = ((await uploaded.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "V-BGM race probe" });

    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );
    await page.route(/youtube-nocookie\.com/, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html>" }),
    );

    await page.goto(`/gallery/race-${RACE_EVENT_KEY}-${RACE_YEAR}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("load");
    await page.getByTestId("gallery-album").locator("img").first().click();
    await expect(page.getByTestId("gallery-music-toggle")).toBeVisible({
      timeout: budget(15_000),
    });
    await page.getByRole("button", { name: "Play" }).click();

    await expect(page.getByTestId("slideshow-music")).toHaveAttribute(
      "data-video-id",
      EDITION_VIDEO_ID,
      { timeout: budget(10_000) },
    );

    // Put the edition back as it was found. Unlike the media rows, this is a
    // shared row the test only borrowed — and one that would otherwise leave
    // music on a race for every later run.
    await request.patch(`/api/race-editions/${editionId}`, {
      data: { musicUrl: null },
    });
  });

  test("V-BGM-T4: an album with no music of its own falls back to the site list", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(90_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    // The global is one document and this test rewrites it, so what it found
    // has to go back — captured before the write, restored at the end whatever
    // happens in between.
    const before = await request.get("/api/globals/site?depth=0");
    expect(before.ok(), await before.text()).toBeTruthy();
    const previous = ((await before.json()) as { backgroundMusic?: unknown[] })
      .backgroundMusic ?? [];

    try {
      const set = await request.post("/api/globals/site", {
        data: {
          backgroundMusic: [
            { url: `https://www.youtube.com/watch?v=${FALLBACK_VIDEO_ID}` },
          ],
        },
      });
      expect(set.ok(), `site global update failed: ${await set.text()}`).toBeTruthy();

      const stamp = Date.now();
      const uploaded = await request.post("/api/media", {
        multipart: {
          file: { name: `v-bgm-fb-${stamp}.svg`, mimeType: "image/svg+xml", buffer: SVG },
          _payload: JSON.stringify({ alt: `V-BGM fallback ${stamp}`, usage: "gallery" }),
        },
      });
      expect(uploaded.ok()).toBeTruthy();
      const mediaId = ((await uploaded.json()) as { doc: { id: number } }).doc.id;
      created.push({ collection: "media", id: mediaId });
      recordCreated({ collection: "media", id: mediaId, note: "V-BGM fallback probe" });

      const slug = `v-bgm-fb-${stamp}`;
      const album = await request.post("/api/galleries", {
        data: {
          name: `V-BGM fallback ${stamp}`,
          slug,
          _status: "published",
          // No musicUrl. That is the point.
          items: [{ media: mediaId, featured: false }],
        },
      });
      expect(album.ok(), await album.text()).toBeTruthy();
      const albumId = ((await album.json()) as { doc: { id: number } }).doc.id;
      created.push({ collection: "galleries", id: albumId });
      recordCreated({ collection: "galleries", id: albumId, note: "V-BGM fallback album" });

      await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
        route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
      );
      await page.route(/youtube-nocookie\.com/, (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html>" }),
      );

      await page.goto(`/gallery/${slug}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("load");
      await page.getByTestId("gallery-album").locator("img").first().click();
      await expect(page.getByTestId("gallery-music-toggle")).toBeVisible({
        timeout: budget(15_000),
      });
      await page.getByRole("button", { name: "Play" }).click();

      await expect(page.getByTestId("slideshow-music")).toHaveAttribute(
        "data-video-id",
        FALLBACK_VIDEO_ID,
        { timeout: budget(10_000) },
      );
    } finally {
      await request.post("/api/globals/site", {
        data: { backgroundMusic: previous },
      });
    }
  });

  test("V-BGM-T5: a video slide does not stop the music; playing the video does", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(90_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const upload = async (name: string, mimeType: string, buffer: Buffer) => {
      const res = await request.post("/api/media", {
        multipart: {
          file: { name, mimeType, buffer },
          _payload: JSON.stringify({ alt: `V-BGM mix ${name}`, usage: "gallery" }),
        },
      });
      expect(res.ok(), `fixture upload failed: ${res.status()}`).toBeTruthy();
      const id = ((await res.json()) as { doc: { id: number } }).doc.id;
      created.push({ collection: "media", id });
      recordCreated({ collection: "media", id, note: "V-BGM mix" });
      return id;
    };

    const photoId = await upload(`v-bgm-mix-${stamp}.svg`, "image/svg+xml", SVG);
    const videoId = await upload(`v-bgm-mix-${stamp}.mp4`, "video/mp4", MP4_HEADER);
    // A third item, and not for realism: the carousel keeps the previous and
    // next slides mounted, so in a two-item album the single video is both the
    // current slide *and* a neighbour — one `<video>` in the document twice,
    // which makes every locator for it ambiguous. Three items give it exactly
    // one position.
    const tailId = await upload(`v-bgm-mix-tail-${stamp}.svg`, "image/svg+xml", SVG);

    const slug = `v-bgm-mix-${stamp}`;
    const album = await request.post("/api/galleries", {
      data: {
        name: `V-BGM mix ${stamp}`,
        slug,
        _status: "published",
        musicUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
        // Photo first so the lightbox opens on it and the video is one step
        // away — the shape a member's album actually has.
        items: [
          { media: photoId, featured: false },
          { media: videoId, featured: false },
          { media: tailId, featured: false },
        ],
      },
    });
    expect(album.ok(), await album.text()).toBeTruthy();
    const albumId = ((await album.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "galleries", id: albumId });
    recordCreated({ collection: "galleries", id: albumId, note: "V-BGM mix album" });

    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );
    await page.route(/youtube-nocookie\.com/, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html>" }),
    );

    await page.goto(`/gallery/${slug}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await page.getByTestId("gallery-album").locator("img").first().click();
    await expect(page.getByTestId("gallery-music-toggle")).toBeVisible({
      timeout: budget(15_000),
    });
    await page.getByRole("button", { name: "Play" }).click();
    await expect(page.getByTestId("slideshow-music")).toHaveCount(1, {
      timeout: budget(10_000),
    });

    /**
     * A handle on the player that is running *now*.
     *
     * The assertion below is about continuity, and continuity cannot be
     * expressed as "is there an iframe": this player stops by unmounting, so a
     * track that was killed and started again looks identical to one that
     * never stopped — a fresh element with the same testid. The first version
     * of this test asserted the count and went green on both arms of the A/B,
     * which is worse than no assertion because it looked like coverage.
     *
     * A handle survives the check. If React removed the element, this exact
     * node is detached, whatever replaced it.
     */
    const playing = await page.getByTestId("slideshow-music").elementHandle();
    expect(playing, "the player should be mounted before the video slide").not.toBeNull();

    // THE REGRESSION THIS PINS. The rule used to be "a video is on screen", so
    // stepping onto the video killed the music — and stepping off started the
    // track again from the beginning, because this player stops by unmounting.
    // An album with one video therefore restarted its music on every lap.
    // `.yarl__navigation_next`, not the accessible name: the thumbnails strip
    // has its own "Next" button, so the name alone matches two elements.
    await page.locator("button.yarl__navigation_next").click();

    // `.yarl__slide_current`, and this is the assertion the first version of
    // this test got wrong. The carousel keeps the neighbouring slides mounted
    // and marks them `inert` — which Playwright still reports as *visible*, so
    // `expect(video).toBeVisible()` passed whether or not the test had
    // actually navigated onto the video. Both arms of the A/B went green, and
    // the test proved nothing. Only the `_current` class says which slide is
    // on screen.
    const player = page.locator(".yarl__slide_current video");
    await expect(player, "the video slide is the one on screen now").toBeVisible({
      timeout: budget(10_000),
    });
    await expect(player.locator("source")).toHaveAttribute(
      "src",
      new RegExp(`v-bgm-mix-${stamp}\\.mp4`),
    );

    // Wait for the *component's* idea of the current slide to catch up before
    // asserting on a rule that reads it. The `_current` class moves with the
    // carousel's own animation, while `on.view` — which is what updates the
    // index the music rule uses — fires after it. Asserting the music
    // immediately therefore read a state that was still true for a moment
    // under the old rule too, and the A/B went green on both arms.
    //
    // The share button's href is that same index, rendered. When it names the
    // video, the component has moved.
    await expect(page.getByTestId("gallery-share")).toHaveAttribute(
      "href",
      `/gallery/m/${videoId}`,
      { timeout: budget(10_000) },
    );
    expect(
      await playing!.evaluate((el) => el.isConnected),
      "merely showing a video must not interrupt the music — it is silent until played",
    ).toBe(true);

    // ...and playing it does stop the music, which is the other half of the
    // rule. Driven through the element rather than its controls: those live in
    // the browser's shadow DOM and cannot be clicked, and what is being tested
    // is the listener's reaction to playback, not how playback was started.
    // A block body, so `evaluate` does not await the promise. The fixture is a
    // 1 KB ftyp box with no frames in it, so `play()` never settles — but the
    // `play` *event* fires the moment playback is requested, which is what the
    // listener under test is watching for.
    await player.evaluate((el) => {
      void (el as HTMLVideoElement).play().catch(() => {});
    });
    await expect(page.getByTestId("slideshow-music")).toHaveCount(0, {
      timeout: budget(10_000),
    });

    await player.evaluate((el) => (el as HTMLVideoElement).pause());
    await expect(
      page.getByTestId("slideshow-music"),
      "pausing the video hands the album back its music",
    ).toHaveCount(1, { timeout: budget(10_000) });
  });

  test("V-BGM-T6: the wall plays the site list, and 下一首 moves through it", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(120_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const before = await request.get("/api/globals/site?depth=0");
    expect(before.ok(), await before.text()).toBeTruthy();
    const previous = ((await before.json()) as { backgroundMusic?: unknown[] })
      .backgroundMusic ?? [];

    try {
      const set = await request.post("/api/globals/site", {
        data: {
          backgroundMusic: [
            { url: `https://www.youtube.com/watch?v=${FALLBACK_VIDEO_ID}` },
            { url: `https://www.youtube.com/watch?v=${FALLBACK_TWO}` },
            { url: `https://www.youtube.com/watch?v=${FALLBACK_THREE}` },
          ],
        },
      });
      expect(set.ok(), `site global update failed: ${await set.text()}`).toBeTruthy();

      await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
        route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
      );
      await page.route(/youtube-nocookie\.com/, (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html>" }),
      );

      // THE GAP THIS CLOSES. Every *album* could play something and the
      // landing view could not — which is backwards, since 全部相片 is what a
      // visitor sees first and stays in longest. The wall is not an album and
      // has no row to store music on, so it plays the site-wide list outright.
      await page.goto("/gallery", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("gallery-all-photos")).toBeVisible({
        timeout: budget(20_000),
      });
      await page.waitForLoadState("load");
      await page.getByTestId("gallery-all-photos").locator("img").first().click();

      const toggle = page.getByTestId("gallery-music-toggle");
      await expect(
        toggle,
        "the wall should offer music now that the site has a list",
      ).toBeVisible({ timeout: budget(15_000) });
      await page.getByRole("button", { name: "Play" }).click();

      const player = page.getByTestId("slideshow-music");
      await expect(player).toHaveCount(1, { timeout: budget(10_000) });
      const first = await player.getAttribute("data-video-id");
      expect(
        [FALLBACK_VIDEO_ID, FALLBACK_TWO, FALLBACK_THREE],
        "the wall's track must come from the site list",
      ).toContain(first);

      // Skipping. The player stops by unmounting, so a skip is a different
      // frame on a different id — `data-video-id` is the only thing that says
      // which, and `data-track` says where in the list we are.
      await expect(player).toHaveAttribute("data-track", "0");
      await page.getByTestId("gallery-music-next").click();
      await expect(page.getByTestId("slideshow-music")).toHaveAttribute(
        "data-track",
        "1",
        { timeout: budget(10_000) },
      );
      const second = await page.getByTestId("slideshow-music").getAttribute("data-video-id");
      expect(second, "下一首 must load a different track").not.toBe(first);

      // ...and back, which has to wrap rather than sit at the start doing
      // nothing — a button a visitor presses twice before deciding it is
      // broken is worse than no button.
      await page.getByTestId("gallery-music-previous").click();
      await expect(page.getByTestId("slideshow-music")).toHaveAttribute(
        "data-track",
        "0",
        { timeout: budget(10_000) },
      );
      await page.getByTestId("gallery-music-previous").click();
      await expect(
        page.getByTestId("slideshow-music"),
        "上一首 from the first track wraps to the last",
      ).toHaveAttribute("data-track", "2", { timeout: budget(10_000) });
    } finally {
      await request.post("/api/globals/site", {
        data: { backgroundMusic: previous },
      });
    }
  });

  test("V-BGM-T7: one track offers no skip controls", async ({ page, request }) => {
    test.setTimeout(budget(90_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const before = await request.get("/api/globals/site?depth=0");
    const previous = ((await before.json()) as { backgroundMusic?: unknown[] })
      .backgroundMusic ?? [];

    try {
      // Emptied, so the album below has exactly its own one track and nothing
      // to continue into.
      const cleared = await request.post("/api/globals/site", {
        data: { backgroundMusic: [] },
      });
      expect(cleared.ok(), await cleared.text()).toBeTruthy();

      const stamp = Date.now();
      const uploaded = await request.post("/api/media", {
        multipart: {
          file: { name: `v-bgm-one-${stamp}.svg`, mimeType: "image/svg+xml", buffer: SVG },
          _payload: JSON.stringify({ alt: `V-BGM one ${stamp}`, usage: "gallery" }),
        },
      });
      expect(uploaded.ok()).toBeTruthy();
      const mediaId = ((await uploaded.json()) as { doc: { id: number } }).doc.id;
      created.push({ collection: "media", id: mediaId });
      recordCreated({ collection: "media", id: mediaId, note: "V-BGM one probe" });

      const slug = `v-bgm-one-${stamp}`;
      const album = await request.post("/api/galleries", {
        data: {
          name: `V-BGM one ${stamp}`,
          slug,
          _status: "published",
          musicUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
          items: [{ media: mediaId, featured: false }],
        },
      });
      expect(album.ok(), await album.text()).toBeTruthy();
      const albumId = ((await album.json()) as { doc: { id: number } }).doc.id;
      created.push({ collection: "galleries", id: albumId });
      recordCreated({ collection: "galleries", id: albumId, note: "V-BGM one album" });

      await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
        route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
      );
      await page.route(/youtube-nocookie\.com/, (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html>" }),
      );

      await page.goto(`/gallery/${slug}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("load");
      await page.getByTestId("gallery-album").locator("img").first().click();

      // The mute control is there, because there IS music...
      await expect(page.getByTestId("gallery-music-toggle")).toBeVisible({
        timeout: budget(15_000),
      });
      // ...and the skips are not, because a skip on a one-track list is a
      // control that cannot change the answer — the same rule the 賽事 select
      // follows.
      await expect(page.getByTestId("gallery-music-next")).toHaveCount(0);
      await expect(page.getByTestId("gallery-music-previous")).toHaveCount(0);
    } finally {
      await request.post("/api/globals/site", {
        data: { backgroundMusic: previous },
      });
    }
  });
});
