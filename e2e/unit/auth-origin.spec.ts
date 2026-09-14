import { expect, test } from "@playwright/test";

import { withOwnOrigin } from "@/lib/auth-origin";

/**
 * U-AUTHORIGIN — a page render tells Payload where it came from, and does
 * not speak for a request that already said.
 *
 * The first is why signed-in members stayed signed in across a refresh; the
 * second is the part that must not drift. Payload accepts a cookie on a
 * matching `Origin` without consulting anything else, so an implementation
 * that overwrote the header would hand every genuine cross-site request the
 * same pass — a change that looks like a simplification and removes the
 * check entirely.
 */

const SITE = "https://wildrunner.org";

test.describe("U-AUTHORIGIN saying which origin a page render came from", () => {
  test("U-AUTHORIGIN-1: a navigation carries no Origin, so it is given ours", () => {
    // What a browser sends for a top-level GET: fetch metadata, no Origin.
    const navigation = new Headers({
      "Sec-Fetch-Site": "cross-site",
      Cookie: "payload-token=abc",
    });

    const out = withOwnOrigin(navigation, SITE);

    expect(out.get("Origin")).toBe(SITE);
    // Everything else travels unchanged — the cookie above is the whole
    // point of the exercise.
    expect(out.get("Cookie")).toBe("payload-token=abc");
    expect(out.get("Sec-Fetch-Site")).toBe("cross-site");
  });

  test("U-AUTHORIGIN-2: a request that already named its origin keeps it", () => {
    const crossSite = new Headers({ Origin: "https://evil.example" });

    // Untouched, so Payload's allowlist still gets to reject it. This is the
    // assertion that stops the fix from becoming a hole.
    expect(withOwnOrigin(crossSite, SITE).get("Origin")).toBe(
      "https://evil.example",
    );
  });

  test("U-AUTHORIGIN-3: no serverURL means nothing to claim, and the input is never mutated", () => {
    const navigation = new Headers({ Cookie: "payload-token=abc" });

    // `serverURL` empty is the one case where Payload's csrf list is empty
    // too, so the cookie is accepted anyway and there is nothing to add.
    expect(withOwnOrigin(navigation, "").get("Origin")).toBeNull();

    withOwnOrigin(navigation, SITE);
    expect(
      navigation.get("Origin"),
      "the caller's headers were modified in place",
    ).toBeNull();
  });
});
