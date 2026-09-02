import { expect, test } from "@playwright/test";

import {
  DEFAULT_QUOTA_MB,
  defaultQuotaMb,
  quotaBytesFor,
  sumStoredBytes,
} from "@/lib/quota";

/**
 * U-QUOTA — how much space a member gets.
 *
 * The number itself, not the enforcement. Enforcement is one contract test;
 * this is the arithmetic that decides whether a member is stopped at 100 GB or
 * at 10 MB.
 *
 * It USED to read `MEMBER_STORAGE_QUOTA_MB`, and that is the whole story of
 * U-QUOTA-2 below. The constant was raised from 10 GB to 100 GB and every
 * deployed environment went on serving 10 GB, because `wrangler.jsonc` set the
 * variable in production and staging and the constant was only ever the
 * fallback. Nothing failed — the storage bar kept rendering "10.00 GB", which
 * is what a working storage bar looks like — and a person reading the page is
 * what found it. The value is code now, and U-QUOTA-2 is the assertion that it
 * stays that way even when a stray variable is lying around.
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

  test("U-QUOTA-1: the default is 100 GB", () => {
    expect(withEnv(undefined, defaultQuotaMb)).toBe(100 * 1024);
    // The constant itself, so the number is asserted and not merely derived
    // from whatever the function happens to return.
    expect(DEFAULT_QUOTA_MB).toBe(100 * 1024);
  });

  test("U-QUOTA-2: a stray MEMBER_STORAGE_QUOTA_MB no longer changes anything", () => {
    // THE REGRESSION THIS PINS, and it shipped. While this variable was read,
    // `wrangler.jsonc` set it to "10240" in production and staging, so raising
    // the constant to 100 GB moved nothing that anybody could see. The value
    // is code now; a variable left behind in a deploy secret has to be inert.
    for (const stale of ["10240", "500", "0", "abc"]) {
      expect(withEnv(stale, defaultQuotaMb), stale).toBe(100 * 1024);
    }
  });

  test("U-QUOTA-3: and neither does the absence of one", () => {
    // The control. Without it U-QUOTA-2 would also pass for a function that
    // returned 100 GB by accident — say, one that had stopped being called.
    expect(withEnv(undefined, defaultQuotaMb)).toBe(
      withEnv("10240", defaultQuotaMb),
    );
  });

  test("U-QUOTA-4: a per-user override wins, and only when it is positive", () => {
    withEnv(undefined, () => {
      expect(quotaBytesFor({ storageQuotaMb: 200 })).toBe(200 * 1024 * 1024);
      // Null, zero and negative all mean "no override", not "no space".
      for (const value of [null, undefined, 0, -1]) {
        expect(quotaBytesFor({ storageQuotaMb: value as never })).toBe(
          100 * 1024 * 1024 * 1024,
        );
      }
    });
  });
});
