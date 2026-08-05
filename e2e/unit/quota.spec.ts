import { expect, test } from "@playwright/test";

import { defaultQuotaMb, quotaBytesFor } from "@/lib/quota";

/**
 * U-QUOTA — how much space a member gets.
 *
 * The number itself, not the enforcement. Enforcement is one contract test;
 * this is the arithmetic that decides whether a member is stopped at 10 GB or
 * at 10 MB, and it reads an environment variable, which is exactly the kind of
 * thing that is wrong in one environment only.
 */
/**
 * `process.env` is typed from cloudflare-env.d.ts, where these keys are
 * required string literals — so TypeScript refuses both `delete` and a
 * plain assignment. The cast is to the shape Node actually has.
 */
const env = process.env as unknown as Record<string, string | undefined>;

test.describe("U-QUOTA storage quota", () => {
  const withEnv = <T,>(value: string | undefined, run: () => T): T => {
    const previous = env.MEMBER_STORAGE_QUOTA_MB;
    if (value === undefined) delete env.MEMBER_STORAGE_QUOTA_MB;
    else env.MEMBER_STORAGE_QUOTA_MB = value;
    try {
      return run();
    } finally {
      if (previous === undefined) delete env.MEMBER_STORAGE_QUOTA_MB;
      else env.MEMBER_STORAGE_QUOTA_MB = previous;
    }
  };

  test("U-QUOTA-1: the default is 10 GB when nothing is configured", () => {
    expect(withEnv(undefined, defaultQuotaMb)).toBe(10 * 1024);
  });

  test("U-QUOTA-2: a configured value replaces the default", () => {
    expect(withEnv("500", defaultQuotaMb)).toBe(500);
  });

  test("U-QUOTA-3: a nonsense environment value falls back rather than to zero", () => {
    // The failure this prevents: a typo in the deploy secret silently giving
    // every member a zero-byte quota, which reads as "uploads are broken".
    for (const bad of ["", "abc", "0", "-5", "NaN"]) {
      expect(withEnv(bad, defaultQuotaMb), bad).toBe(10 * 1024);
    }
  });

  test("U-QUOTA-4: a per-user override wins, and only when it is positive", () => {
    withEnv(undefined, () => {
      expect(quotaBytesFor({ storageQuotaMb: 200 })).toBe(200 * 1024 * 1024);
      // Null, zero and negative all mean "no override", not "no space".
      for (const value of [null, undefined, 0, -1]) {
        expect(quotaBytesFor({ storageQuotaMb: value as never })).toBe(
          10 * 1024 * 1024 * 1024,
        );
      }
    });
  });
});
