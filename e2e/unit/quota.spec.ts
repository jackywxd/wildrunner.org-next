import { expect, test } from "@playwright/test";

import { defaultQuotaMb, quotaBytesFor, sumStoredBytes } from "@/lib/quota";

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

test.describe("U-QUOTA-STORED what a member's media occupies", () => {
  test("U-QUOTA-5: a transcoded video is charged for both files", () => {
    // The failure this exists for: `filesize` is overwritten with the
    // transcoded size on success while the original stays in R2 forever, so
    // summing `filesize` alone made the quota FALL after a transcode. A
    // member could reach the ceiling, wait for their videos to convert, and
    // upload to it again — nothing bounded real storage at all. Measured on
    // staging: a 20.9 MB source reporting 5.4 MB afterwards.
    expect(
      sumStoredBytes([{ filesize: 5_402_810, originalFilesize: 20_934_042 }]),
    ).toBe(26_336_852);
  });

  test("U-QUOTA-6: an untranscoded file is charged once, not twice", () => {
    // Every photo, and every video before it converts, has no original kept
    // separately — `filesize` IS the only object. Charging a phantom second
    // copy would eat a member's allowance for files that do not exist.
    expect(sumStoredBytes([{ filesize: 1000 }])).toBe(1000);
    expect(sumStoredBytes([{ filesize: 1000, originalFilesize: null }])).toBe(1000);
  });

  test("U-QUOTA-7: a missing or non-numeric size counts as nothing, not NaN", () => {
    // One bad row must not poison the whole total. `NaN` compared against
    // the quota is false either way, which would silently disable the limit.
    expect(sumStoredBytes([{}, { filesize: null }, { filesize: 500 }])).toBe(500);
    expect(Number.isFinite(sumStoredBytes([{ filesize: undefined }]))).toBe(true);
  });
});

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
