import type { APIRequestContext } from "@playwright/test";

export const TEST_ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@wildrunner.test",
  password: process.env.E2E_ADMIN_PASSWORD ?? "WildRunnerAdmin1!",
};

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
