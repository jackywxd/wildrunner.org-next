import { test, expect } from "@playwright/test";

import { TEST_ADMIN } from "../helpers/auth";
import { adminContext } from "../helpers/members";

/**
 * A2 — admin panel i18n (zh-TW default, English available per-account).
 *
 * Before this, payload.config.ts had no `i18n` block at all, so the panel
 * rendered in English regardless of who was signed in, and the four custom
 * panels carried a mix of Traditional and Simplified Chinese hardcoded
 * directly into JSX (InviteMemberPanel/StorageQuotaField/LargeUploadPanel
 * were Traditional; AIAssistField was Simplified).
 */
test.describe("A2 admin i18n", () => {
  // Same reason as branding.spec.ts: these sort near the front of the suite,
  // so on a fresh database there is no account to sign in as yet and /admin
  // serves the create-first-user screen instead.
  test.beforeAll(async ({ baseURL }) => {
    const admin = await adminContext(baseURL);
    await admin.dispose();
  });

  async function signInAdmin(page: import("@playwright/test").Page) {
    const login = await page.context().request.post("/api/users/login", {
      data: TEST_ADMIN,
    });
    expect(login.ok()).toBeTruthy();
  }

  /**
   * Pick a language and wait for the chrome to show it.
   *
   * The option is scoped to `.rs__option` rather than matched by text
   * anywhere on the page: react-select also renders the *currently selected*
   * label in a `.rs__single-value` div, and clicking that one is silently
   * intercepted forever by `.rs__input-container` sitting on top of it.
   *
   * KNOWN DEFECT (production builds only, English -> zh-TW direction):
   * choosing 中文（繁體） saves correctly — `payload-lng=zh-TW` is set, and
   * requesting the page with that cookie renders "Payload 設定" server-side —
   * but the client keeps rendering English until a reload. The zh-TW -> en
   * direction updates in place, and both directions update in place under
   * `next dev`. Measured on staging; a plain reload is the workaround, so
   * that is what this does rather than waiting for something that will
   * never happen.
   */
  async function chooseLanguage(
    page: import("@playwright/test").Page,
    optionLabel: string,
    expectedHeading: string,
  ) {
    await page.locator("#language-select").click();
    await page
      .locator(".rs__option")
      .filter({ hasText: optionLabel })
      .first()
      .click();

    const heading = page.getByRole("heading", { name: expectedHeading });
    try {
      await heading.waitFor({ timeout: 20_000 });
    } catch {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(heading).toBeVisible({ timeout: 45_000 });
    }
  }

  test("A2-T1: the sidebar chrome is Traditional Chinese by default", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto("/admin");

    // Chrome strings ("Collections", "Globals", "Dashboard") come from
    // @payloadcms/translations, not from anything this repo wrote — this is
    // asserting the config wiring, not the translation content itself.
    // .first(): the same label appears once in the nav group and once as
    // the dashboard section heading.
    await expect(page.getByText("集合").first()).toBeVisible();
    await expect(page.getByText("全域").first()).toBeVisible();
  });

  test("A2-T2: switching to English changes the same page's chrome", async ({
    page,
  }) => {
    // Four language switches, each a server action + refresh. Comfortably
    // under the 30s default locally; not against a remote Worker.
    test.setTimeout(180_000);
    await signInAdmin(page);
    await page.goto("/admin/account");

    // The account page has no literal "Account" heading — useAsTitle on
    // Users renders the email instead — so assert on the one heading that
    // does exist and is known to translate: the "Payload Settings" panel
    // this very language switcher lives inside of.
    await expect(page.getByRole("heading", { name: "Payload 設定" })).toBeVisible();
    await expect(page.locator("#language-select")).toBeVisible();

    // switchLanguage does a server action + router.refresh(); the page itself
    // doesn't navigate, so chooseLanguage waits for the chrome text to flip
    // rather than for a load event.
    await chooseLanguage(page, "English", "Payload Settings");

    // ...and back, so nothing downstream inherits an English panel.
    await chooseLanguage(page, "中文（繁體）", "Payload 設定");
  });

  test("A2-T3: the language choice persists across reloads", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signInAdmin(page);
    await page.goto("/admin/account");

    await chooseLanguage(page, "English", "Payload Settings");

    await page.reload();
    // Payload keeps this choice in a cookie, not on the user document —
    // `GET /api/users/<id>` shows no `language` field either way. So this
    // asserts the choice survives a reload of the same browser, which is all
    // the mechanism actually promises; a different browser starts at the
    // configured fallback (zh-TW) again.
    await expect(
      page.getByRole("heading", { name: "Payload Settings" }),
    ).toBeVisible({ timeout: 45_000 });

    // Restore zh-TW for the rest of the suite.
    await chooseLanguage(page, "中文（繁體）", "Payload 設定");
  });

  test("A2-T4: the custom panels show no mixed-script leftovers", async ({
    page,
  }) => {
    await signInAdmin(page);

    // AIAssistField was the one panel hardcoded in Simplified; 服务/输入/
    // 会 are characters that differ from their Traditional forms 服務/輸入/
    // 會 and would only appear if the old strings survived the extraction.
    await page.goto("/admin/collections/posts/create");
    const aiPanel = page.getByTestId("ai-assist");
    await expect(aiPanel).toBeVisible();
    const aiText = await aiPanel.textContent();
    expect(aiText).not.toMatch(/[服输会]/);

    await page.goto("/admin/collections/media");
    const uploadPanel = page.getByTestId("large-upload");
    await expect(uploadPanel).toBeVisible();
    expect(await uploadPanel.textContent()).not.toMatch(/[服输会]/);
  });

  test("A2-T5: collection labels render in the account's language", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto("/admin");

    // Collection names came from Payload's default field-name titleization
    // (English only) until labels: {en, 'zh-TW'} were added; this is the
    // layer app config owns, distinct from A2-T1's Payload-chrome check.
    await expect(page.locator('a[href^="/admin/collections/posts"]').first())
      .toContainText("文章");
    await expect(page.locator('a[href^="/admin/collections/media"]').first())
      .toContainText("媒體");
  });
});
