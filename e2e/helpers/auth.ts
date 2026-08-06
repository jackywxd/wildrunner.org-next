import type { APIRequestContext } from "@playwright/test";

import { BASE_URL } from "../../playwright.config";

/**
 * The fallback password below is published. This repository is public, so
 * anybody can read it — which is fine for a database that lives inside a CI
 * job or on a laptop, and is not fine for anything reachable from the
 * internet.
 *
 * It was not fine. The staging Worker answers `/`, `/admin` and
 * `/members/login` with 200 to anyone, `deploy.yml` ran this suite against it,
 * and no workflow set `E2E_ADMIN_PASSWORD` — so every deploy demonstrated that
 * a published credential opened a public site. Nothing had to be guessed: the
 * job succeeded, which is the proof.
 *
 * The blast radius was smaller than it sounds, and by design rather than by
 * luck: `sync-prod-content-to-staging.ts` deliberately keeps `users` out of
 * staging — its header names this very constant as the reason — so no real
 * email or password hash was ever there, and staging cannot send mail. What
 * was exposed was the ability to sign in and change staging content.
 *
 * The guard below is the part that matters. Removing the fallback would only
 * mean the next person re-adds one; failing loudly when a *published* password
 * meets a *remote* origin makes the unsafe combination impossible to
 * reintroduce quietly, and leaves local runs exactly as convenient as before.
 */
const PUBLISHED_FALLBACK = "WildRunnerAdmin1!";

const isLocalTarget = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(
  BASE_URL,
);

export const TEST_ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@wildrunner.test",
  password: process.env.E2E_ADMIN_PASSWORD ?? PUBLISHED_FALLBACK,
};

if (!isLocalTarget && TEST_ADMIN.password === PUBLISHED_FALLBACK) {
  throw new Error(
    [
      `Refusing to sign in to ${BASE_URL} with the password published in this repository.`,
      "",
      "Set E2E_ADMIN_PASSWORD (and E2E_ADMIN_EMAIL if it differs) for any run",
      "against a deployed origin. In CI that means a repository secret wired",
      "into the workflow step; see .github/workflows/deploy.yml.",
      "",
      "Changing the password on the deployed environment is a separate step,",
      "and this guard does not do it: rotate the account there as well.",
    ].join("\n"),
  );
}

async function login(request: APIRequestContext) {
  return request.post("/api/users/login", {
    data: {
      email: TEST_ADMIN.email,
      password: TEST_ADMIN.password,
    },
  });
}

/** Ensure an admin user exists (first-user create or no-op if already present). */
export async function ensureAdminUser(request: APIRequestContext) {
  const firstLogin = await login(request);
  if (firstLogin.ok()) {
    return firstLogin;
  }

  const create = await request.post("/api/users", {
    data: {
      email: TEST_ADMIN.email,
      password: TEST_ADMIN.password,
    },
  });

  if (!create.ok() && create.status() !== 400 && create.status() !== 403) {
    throw new Error(
      `Failed to create admin user: ${create.status()} ${await create.text()}`,
    );
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const retry = await login(request);
    if (retry.ok()) {
      return retry;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }

  throw new Error("Failed to login after ensuring admin user exists");
}
