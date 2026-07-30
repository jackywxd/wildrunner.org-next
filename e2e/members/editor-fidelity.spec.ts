import { test, expect } from "@playwright/test";

import { adminContext, ensureMemberUser, loginContext, TEST_MEMBER } from "../helpers/members";
import { roundTripPayloadContent } from "@/lib/editor/serialize";
import { $createMemberUploadNode } from "@/lib/editor/nodes/upload-node";
import { createMemberEditor } from "@/lib/editor/config";
import { lexicalParagraph } from "@/lib/lexical-helpers";

import type { PayloadContent } from "@/lib/editor/serialize";

/**
 * Phase B — editor fidelity harness. The risk-retiring gate for the member
 * editor: no UI exists yet, and none of it starts until this is green.
 *
 * Using Lexical directly (via @payloadcms/richtext-lexical's proxy exports)
 * rather than a different editor library means no format-conversion layer
 * ever runs against `posts.content` — but the member editor's node set still
 * has to actually cover what real posts contain, or Lexical throws on an
 * unregistered `type` the moment it meets one.
 *
 * Runs as plain Node/Playwright test code, not a browser test: round-
 * tripping content only calls `importJSON`/`exportJSON`, never `createDOM`/
 * `decorate`, so none of it needs an actual DOM. Confirmed by running the
 * exact same code under plain `tsx` with no jsdom present at all.
 */
test.describe("editor fidelity", () => {
  function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (a && b && typeof a === "object") {
      const ak = Object.keys(a);
      const bk = Object.keys(b as object);
      if (ak.length !== bk.length) return false;
      for (const k of ak) {
        if (!bk.includes(k)) return false;
        if (!deepEqual((a as never)[k], (b as never)[k])) return false;
      }
      return true;
    }
    return false;
  }

  function firstDivergence(a: unknown, b: unknown, path: string): string | null {
    if (deepEqual(a, b)) return null;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
      return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return `${path}.length: ${a.length} vs ${b.length}`;
      for (let i = 0; i < a.length; i++) {
        const d = firstDivergence(a[i], b[i], `${path}[${i}]`);
        if (d) return d;
      }
      return path;
    }
    const ak = Object.keys(a);
    const bk = Object.keys(b as object);
    const onlyA = ak.filter((k) => !bk.includes(k));
    const onlyB = bk.filter((k) => !ak.includes(k));
    if (onlyA.length) return `${path}: missing in output — ${onlyA.join(", ")}`;
    if (onlyB.length) return `${path}: extra in output — ${onlyB.join(", ")}`;
    for (const k of new Set([...ak, ...bk])) {
      const d = firstDivergence((a as never)[k], (b as never)[k], `${path}.${k}`);
      if (d) return d;
    }
    return path;
  }

  test("B-T1: every real post round-trips deep-equal", async ({ baseURL }) => {
    const admin = await adminContext(baseURL);
    try {
      const response = await admin.get("/api/posts?limit=500&depth=0");
      expect(response.ok()).toBeTruthy();
      const { docs } = (await response.json()) as {
        docs: { id: number; slug: string; content?: PayloadContent }[];
      };
      // The corpus this gate exists for — if this is suspiciously small,
      // something upstream (migration, seeding) regressed independently of
      // anything this test checks.
      expect(docs.length).toBeGreaterThan(0);

      const failures: string[] = [];
      for (const doc of docs) {
        if (!doc.content) continue;
        // Canonicalize both sides through the same JSON.stringify a real
        // save already goes through (the fetch body when the editor PATCHes
        // content, and Payload's own write to D1's TEXT column) rather than
        // comparing raw in-memory objects straight off Lexical's exporter.
        // @lexical/list's ListItemNode.exportJSON() always sets `checked:
        // this.getChecked()`, which is `undefined` for a plain bullet item
        // — a real JSON.stringify drops that key, an in-memory object still
        // carries it, and comparing without this step reports a difference
        // that could never actually reach Payload.
        const canonicalInput = JSON.parse(JSON.stringify(doc.content)) as PayloadContent;
        let result: PayloadContent;
        try {
          result = roundTripPayloadContent(doc.content);
        } catch (error) {
          failures.push(`post ${doc.id} (${doc.slug}) threw: ${(error as Error).message}`);
          continue;
        }
        if (!deepEqual(result, canonicalInput)) {
          failures.push(
            `post ${doc.id} (${doc.slug}): ${firstDivergence(canonicalInput, result, "root")}`,
          );
        }
      }

      expect(failures, failures.join("\n")).toEqual([]);
    } finally {
      await admin.dispose();
    }
  });

  test("B-T2: an unregistered node type round-trips byte-for-byte via UnknownNode", async () => {
    // Not asserted against real content: nothing in the corpus uses `table`
    // or `block` today (EXPERIMENTAL_TableFeature / BlocksFeature are
    // enabled in payload.config.ts, so an admin could add either at any
    // time), so this is a synthetic fixture standing in for that day.
    const fixture: PayloadContent = {
      root: {
        type: "root",
        version: 1,
        direction: null,
        format: "",
        indent: 0,
        children: [
          {
            type: "table",
            version: 1,
            colWidths: [100, 200],
            children: [
              {
                type: "tablerow",
                version: 1,
                children: [
                  {
                    type: "tablecell",
                    version: 1,
                    headerState: 1,
                    colSpan: 1,
                    rowSpan: 1,
                    children: [
                      {
                        type: "paragraph",
                        version: 1,
                        direction: null,
                        format: "",
                        indent: 0,
                        children: [
                          {
                            type: "text",
                            version: 1,
                            detail: 0,
                            format: 0,
                            mode: "normal",
                            style: "",
                            text: "cell one",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: "block",
            version: 2,
            fields: { blockType: "code", code: "const x = 1", language: "ts" },
          },
        ],
      },
    };

    const result = roundTripPayloadContent(fixture);
    expect(result).toEqual(fixture);
  });

  test("B-T3: a hand-built upload node exports the exact Payload shape", () => {
    const editor = createMemberEditor();
    let exported: unknown;
    editor.update(
      () => {
        const node = $createMemberUploadNode({
          id: "6a686a478e97399315c6785e",
          fields: {},
          relationTo: "media",
          value: 473,
        });
        exported = node.exportJSON();
      },
      { discrete: true },
    );

    expect(exported).toEqual({
      type: "upload",
      version: 3,
      format: "",
      fields: {},
      relationTo: "media",
      value: 473,
      id: "6a686a478e97399315c6785e",
    });
  });
});

/**
 * The server-side guard (`guardPostContent`, wired as Posts' beforeValidate)
 * is the net that catches damage regardless of what the client actually
 * sent — these hit the real REST create path, not the hook function
 * directly, so they prove the wiring as well as the logic.
 */
test.describe("Posts content guard", () => {
  const stamp = Date.now();
  const createdPostIds: number[] = [];

  test.afterAll(async ({ baseURL }) => {
    const admin = await adminContext(baseURL);
    for (const id of createdPostIds) await admin.delete(`/api/posts/${id}`);
    await admin.dispose();
  });

  test("guard-T1: a populated upload value (depth>=1 leakage) is rejected", async ({
    baseURL,
  }) => {
    const admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    const member = await loginContext(baseURL, TEST_MEMBER);

    const content: PayloadContent = lexicalParagraph("test") as PayloadContent;
    content.root.children!.push({
      type: "upload",
      version: 3,
      format: "",
      fields: {},
      relationTo: "media",
      // The bug this guards against: a populated object instead of a bare id.
      value: { id: 473, filename: "leaked.png" } as unknown as number,
      id: "6a686a478e97399315c6785f",
    });

    const response = await member.post("/api/posts", {
      data: {
        title: `guard-populated-${stamp}`,
        slug: `guard-populated-${stamp}`,
        description: "guard test",
        content,
        _status: "draft",
      },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);

    await Promise.all([admin.dispose(), member.dispose()]);
  });

  test("guard-T2: a leaked pending-upload node is rejected", async ({ baseURL }) => {
    const admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    const member = await loginContext(baseURL, TEST_MEMBER);

    const content: PayloadContent = lexicalParagraph("test") as PayloadContent;
    content.root.children!.push({
      type: "upload",
      version: 3,
      format: "",
      pending: { formID: "abc", src: "blob:http://localhost/xyz" },
    } as never);

    const response = await member.post("/api/posts", {
      data: {
        title: `guard-pending-${stamp}`,
        slug: `guard-pending-${stamp}`,
        description: "guard test",
        content,
        _status: "draft",
      },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);

    await Promise.all([admin.dispose(), member.dispose()]);
  });

  test("guard-T3: an ordinary save is unaffected", async ({ baseURL }) => {
    const admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    const member = await loginContext(baseURL, TEST_MEMBER);

    const response = await member.post("/api/posts", {
      data: {
        title: `guard-ok-${stamp}`,
        slug: `guard-ok-${stamp}`,
        description: "guard test",
        content: lexicalParagraph("perfectly ordinary content"),
        _status: "draft",
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const doc = (await response.json()).doc;
    createdPostIds.push(doc.id);

    await Promise.all([admin.dispose(), member.dispose()]);
  });
});
