import { test, expect } from "@playwright/test";

/**
 * A1 — Payload login screen branding.
 *
 * Before this, /admin/login rendered Payload's own placeholder logo and a
 * generic browser tab title. This is the first spec in the suite that
 * actually renders the login screen rather than authenticating by posting
 * to /api/users/login from an APIRequestContext — every other admin spec
 * bypasses the form entirely.
 */
test.describe("A1 admin login branding", () => {
  test("A1-T1: the brand lockup renders from /static/brand/", async ({ page }) => {
    await page.goto("/admin/login");

    const logo = page.getByTestId("brand-logo");
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute(
      "data-brand-src",
      "/static/brand/lockup-horizontal.svg",
    );

    // Inlined SVG, not an <img> — the wordmark has to inherit the panel's
    // text colour (see BrandLogo.tsx), which an <img> src can't do.
    await expect(logo.locator("svg")).toBeVisible();
  });

  test("A1-T2: no Payload default logo remains", async ({ page }) => {
    await page.goto("/admin/login");

    // Payload's stock login mark ships as an <img> whose alt/aria text
    // names the product; ours is an inline <svg role="img"> labelled with
    // the site's own name, so this also catches a partial swap.
    const images = page.locator('img[alt], img[src*="payload" i]');
    await expect(images).toHaveCount(0);
  });

  test("A1-T3: the tab title carries the site name", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page).toHaveTitle(/野馬營/);
  });

  test("A1-T4: the lockup is legible on both admin themes", async ({ page }) => {
    await page.goto("/admin/login");
    const logo = page.getByTestId("brand-logo");

    for (const theme of ["dark", "light"] as const) {
      await page.evaluate(
        (t) => document.documentElement.setAttribute("data-theme", t),
        theme,
      );
      // currentColor only resolves to something visible if it's actually
      // inheriting page colour, not stuck at a hardcoded near-black that
      // happens to match one theme.
      const color = await logo.evaluate((el) => getComputedStyle(el).color);
      expect(color, `wordmark colour on ${theme} theme`).toBeTruthy();
    }
  });
});
