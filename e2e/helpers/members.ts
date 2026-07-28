import type { APIRequestContext } from "@playwright/test";
import { request as playwrightRequest } from "@playwright/test";

import { TEST_ADMIN, ensureAdminUser } from "./auth";

export const TEST_MEMBER = {
  email: process.env.E2E_MEMBER_EMAIL ?? "member@wildrunner.test",
  password: process.env.E2E_MEMBER_PASSWORD ?? "WildRunnerMember1!",
};

export const TEST_MEMBER_TWO = {
  email: process.env.E2E_MEMBER2_EMAIL ?? "member2@wildrunner.test",
  password: process.env.E2E_MEMBER2_PASSWORD ?? "WildRunnerMember2!",
};

type Credentials = { email: string; password: string };

/**
 * Contexts created here don't inherit `use.extraHTTPHeaders` from the
 * config, so the CSRF-satisfying Origin header has to be repeated — without
 * it Payload ignores the auth cookie entirely.
 */
function newContext(baseURL: string | undefined) {
  return playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: baseURL ? { Origin: baseURL } : undefined,
  });
}

/**
 * Role tests need two identities at once, so each gets its own request
 * context (and therefore its own cookie jar) instead of sharing the
 * `request` fixture.
 */
export async function adminContext(
  baseURL: string | undefined,
): Promise<APIRequestContext> {
  const context = await newContext(baseURL);
  await ensureAdminUser(context);
  return context;
}

/** Logged-out context, for asserting what the public can reach. */
export function anonContext(
  baseURL: string | undefined,
): Promise<APIRequestContext> {
  return newContext(baseURL);
}

export async function loginContext(
  baseURL: string | undefined,
  credentials: Credentials,
): Promise<APIRequestContext> {
  const context = await newContext(baseURL);
  const response = await context.post("/api/users/login", {
    data: credentials,
  });
  if (!response.ok()) {
    throw new Error(
      `Login failed for ${credentials.email}: ${response.status()} ${await response.text()}`,
    );
  }
  return context;
}

async function findUserByEmail(admin: APIRequestContext, email: string) {
  const response = await admin.get(
    `/api/users?where[email][equals]=${encodeURIComponent(email)}&limit=1&depth=0`,
  );
  if (!response.ok()) {
    throw new Error(`User lookup failed: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json();
  return body.docs?.[0] ?? null;
}

/**
 * Idempotent member fixture: creates the account if missing, and resets the
 * password if a previous run left one we no longer know. Returns the doc.
 */
export async function ensureMemberUser(
  admin: APIRequestContext,
  credentials: Credentials = TEST_MEMBER,
) {
  const existing = await findUserByEmail(admin, credentials.email);

  if (existing) {
    // Password may differ from a previous run; force it back to the fixture.
    const reset = await admin.patch(`/api/users/${existing.id}`, {
      data: { password: credentials.password, role: "member" },
    });
    if (!reset.ok()) {
      throw new Error(
        `Failed to reset member password: ${reset.status()} ${await reset.text()}`,
      );
    }
    return { ...existing, role: "member" };
  }

  const create = await admin.post("/api/users", {
    data: {
      email: credentials.email,
      password: credentials.password,
      role: "member",
    },
  });
  if (!create.ok()) {
    throw new Error(
      `Failed to create member: ${create.status()} ${await create.text()}`,
    );
  }
  const body = await create.json();
  return body.doc ?? body;
}

export async function getAdminUser(admin: APIRequestContext) {
  const me = await admin.get("/api/users/me");
  const body = await me.json();
  if (!body.user) {
    throw new Error(`Expected an authenticated admin, got: ${JSON.stringify(body)}`);
  }
  return body.user;
}

export { TEST_ADMIN };
