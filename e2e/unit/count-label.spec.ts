import { expect, test } from "@playwright/test";

import { countLabel } from "@/lib/i18n/count";

/**
 * U-COUNT — the one piece of grammar the dictionary carries.
 *
 * Small, and worth pinning because it is invisible when wrong: an English
 * reader sees "1 articles" and thinks less of the site, and nothing else in
 * the suite looks at a number and a noun together.
 */
test.describe("U-COUNT a number in a sentence", () => {
  test("U-COUNT-1: a value with no plural form is used as written", () => {
    // Every Chinese key. The converter never sees the convention.
    expect(countLabel("{count} 篇文章", 1)).toBe("1 篇文章");
    expect(countLabel("{count} 篇文章", 12)).toBe("12 篇文章");
  });

  test("U-COUNT-2: one takes the singular, everything else the plural", () => {
    expect(countLabel("{count} article|{count} articles", 1)).toBe("1 article");
    expect(countLabel("{count} article|{count} articles", 2)).toBe("2 articles");
    // Zero is plural in English — "0 articles", not "0 article".
    expect(countLabel("{count} article|{count} articles", 0)).toBe("0 articles");
  });

  test("U-COUNT-3: the two forms may differ by more than an s", () => {
    // The reason this splits whole strings rather than appending a suffix.
    expect(countLabel("{count} finish|{count} finishes", 1)).toBe("1 finish");
    expect(countLabel(" · {count} member| · {count} members", 1)).toBe(" · 1 member");
  });
});
