import { expect, test } from "@playwright/test";

import {
  isAdmin,
  isAdminOrSelf,
  isAdminUser,
  isAuthenticated,
  isOwner,
  ownedOnly,
  ownedOnlyPublicRead,
} from "@/access";

/**
 * U-ACCESS — the access rules, called directly.
 *
 * These are the most security-relevant functions in the codebase and until now
 * they were only ever asserted by creating rows over HTTP as one account and
 * reading them back as another. That proves Payload applies what the rule
 * returns; it does not pin down what the rule returns, and it costs a server,
 * a database and a fixture per case.
 *
 * Each rule is a pure function of `user`, so the four callers that matter —
 * anonymous, member, a different member, admin — are four object literals.
 * The contract layer keeps exactly one test proving Payload honours a returned
 * `Where`; everything about *which* `Where* is here.
 *
 * Written from the source, not from memory: `ownedOnly` returns a
 * published-only filter for an anonymous caller rather than `false`, and
 * `ownedOnlyPublicRead` returns `true` for one — a distinction that reads as a
 * typo until you see them side by side, and which decides whether the REST API
 * leaks drafts.
 */

const ADMIN = { id: 1, role: "admin" };
const MEMBER = { id: 7, role: "member" };
const OTHER = { id: 8, role: "member" };

/** `Access` receives the whole req; only `user` is read. */
const as = (user: unknown) => ({ req: { user } }) as never;

test.describe("U-ACCESS access rules", () => {
  test("U-ACCESS-1: isAdminUser is true only for role admin", () => {
    expect(isAdminUser(ADMIN)).toBe(true);
    expect(isAdminUser(MEMBER)).toBe(false);
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(undefined)).toBe(false);
    // A user object with no role at all — what a partially-populated
    // relationship looks like — must not read as admin.
    expect(isAdminUser({ id: 1 })).toBe(false);
  });

  test("U-ACCESS-2: isAdmin and isAuthenticated gate on session, not ownership", () => {
    expect(isAdmin(as(ADMIN))).toBe(true);
    expect(isAdmin(as(MEMBER))).toBe(false);
    expect(isAdmin(as(null))).toBe(false);

    expect(isAuthenticated(as(MEMBER))).toBe(true);
    expect(isAuthenticated(as(ADMIN))).toBe(true);
    expect(isAuthenticated(as(null))).toBe(false);
  });

  test("U-ACCESS-3: isOwner refuses anonymous, opens for admin, scopes a member", () => {
    expect(isOwner(as(null))).toBe(false);
    expect(isOwner(as(ADMIN))).toBe(true);
    expect(isOwner(as(MEMBER))).toEqual({ owner: { equals: MEMBER.id } });
    // The scope follows the caller, so one member's rule can never match
    // another's rows.
    expect(isOwner(as(OTHER))).toEqual({ owner: { equals: OTHER.id } });
  });

  test("U-ACCESS-4: ownedOnly gives an anonymous reader published rows, not nothing", () => {
    // Not `false`. The REST API is the only caller that arrives without a
    // session and it must still serve the public site.
    expect(ownedOnly(as(null))).toEqual({ _status: { equals: "published" } });
    expect(ownedOnly(as(ADMIN))).toBe(true);
    expect(ownedOnly(as(MEMBER))).toEqual({ owner: { equals: MEMBER.id } });
  });

  test("U-ACCESS-5: ownedOnlyPublicRead differs from ownedOnly exactly at anonymous", () => {
    // `true`, where ownedOnly returns a published-only filter. Media and
    // authors have no draft state, so there is nothing to hide from a reader;
    // posts and galleries do. Getting these two the wrong way round either
    // hides the site from visitors or serves them drafts.
    expect(ownedOnlyPublicRead(as(null))).toBe(true);
    expect(ownedOnlyPublicRead(as(ADMIN))).toBe(true);
    expect(ownedOnlyPublicRead(as(MEMBER))).toEqual({
      owner: { equals: MEMBER.id },
    });
  });

  test("U-ACCESS-6: isAdminOrSelf scopes a member to their own account row", () => {
    expect(isAdminOrSelf(as(null))).toBe(false);
    expect(isAdminOrSelf(as(ADMIN))).toBe(true);
    // `id`, not `owner` — this one guards the users collection, where the row
    // *is* the account. Using `owner` here would match nothing and lock every
    // member out of their own profile.
    expect(isAdminOrSelf(as(MEMBER))).toEqual({ id: { equals: MEMBER.id } });
  });
});
