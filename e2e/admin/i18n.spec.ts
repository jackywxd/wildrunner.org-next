import { test, expect } from "@playwright/test";

import { TEST_ADMIN } from "../helpers/auth";

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
  async function signInAdmin(page: import("@playwright/test").Page) {
    const login = await page.context().request.post("/api/users/login", {
      data: TEST_ADMIN,
    });
    expect(login.ok()).toBeTruthy();
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
    await signInAdmin(page);
    await page.goto("/admin/account");

    // The account page has no literal "Account" heading — useAsTitle on
    // Users renders the email instead — so assert on the one heading that
    // does exist and is known to translate: the "Payload Settings" panel
    // this very language switcher lives inside of.
    await expect(page.getByRole("heading", { name: "Payload 設定" })).toBeVisible();

    const languageSelect = page.locator("#language-select");
    await expect(languageSelect).toBeVisible();
    await languageSelect.click();
    await page.getByText("English", { exact: true }).click();

    // switchLanguage does a server action + router.refresh(); the page
    // itself doesn't navigate, so wait for the chrome text to flip rather
    // than for a load event.
    await expect(
      page.getByRole("heading", { name: "Payload Settings" }),
    ).toBeVisible({ timeout: 10_000 });

    // Switch back so later tests (and other people's local runs against the
    // same fixture account) see the zh-TW default again.
    await page.locator("#language-select").click();
    await page.getByText("中文（繁體）", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "Payload 設定" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("A2-T3: the language choice persists across reloads", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto("/admin/account");

    await page.locator("#language-select").click();
    await page.getByText("English", { exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Payload Settings" }),
    ).toBeVisible({ timeout: 10_000 });

    await page.reload();
    // Persisted on the user record, not the browser: a plain reload (no
    // re-selection) must still show English if it survived.
    await expect(
      page.getByRole("heading", { name: "Payload Settings" }),
    ).toBeVisible();

    // Restore zh-TW for the rest of the suite.
    await page.locator("#language-select").click();
    await page.getByText("中文（繁體）", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "Payload 設定" })).toBeVisible({
      timeout: 10_000,
    });
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
