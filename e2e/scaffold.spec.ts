import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

test.describe("P0 scaffold gates", () => {
  test("P0-T1: feature branch exists on origin", async () => {
    const output = execFileSync(
      "git",
      ["ls-remote", "--heads", "origin", "feat/payload-cms-migration"],
      { encoding: "utf8" },
    );
    expect(output).toContain("feat/payload-cms-migration");
  });

  test("P0-T3: wrangler bindings include D1/R2/AI/IMAGES/STREAM", async () => {
    const report = execFileSync("node", ["scripts/assert-bindings.mjs"], {
      encoding: "utf8",
    });
    const json = JSON.parse(report);
    expect(json.ok).toBeTruthy();
    expect(json.bindings).toEqual(
      expect.arrayContaining(["D1", "R2", "AI", "IMAGES", "STREAM"]),
    );
  });

  test("P0-T5: unauthenticated cannot list protected collections", async ({
    request,
  }) => {
    const users = await request.get("/api/users");
    expect(users.status()).toBeGreaterThanOrEqual(400);

    const posts = await request.get("/api/posts?draft=true");
    const body = await posts.json();
    const hasDraft = (body.docs ?? []).some(
      (doc: { _status?: string }) => doc._status === "draft",
    );
    expect(hasDraft).toBeFalsy();
  });
});

test.describe("P3 migration counts", () => {
  test("P3-T1: dry-run source counts meet thresholds", async () => {
    const report = execFileSync(
      "pnpm",
      ["exec", "tsx", "scripts/migrate-velite-to-payload.ts", "--dry-run"],
      { encoding: "utf8" },
    );
    const json = JSON.parse(report.slice(report.indexOf("{")));
    expect(json.source).toEqual({
      posts: 15,
      galleries: 20,
      images: 398,
      videos: 22,
      authors: 1,
      globals: 1,
    });
  });

  test("P3-T8: Workers Builds documents LFS skip", async () => {
    const report = execFileSync("node", ["scripts/assert-no-lfs-in-builds.mjs"], {
      encoding: "utf8",
    });
    expect(JSON.parse(report).ok).toBeTruthy();
    const docs = fs.readFileSync(
      path.join(process.cwd(), "docs/workers-builds.md"),
      "utf8",
    );
    expect(docs).toContain("Git LFS");
    expect(docs).toContain("关闭");
  });
});
