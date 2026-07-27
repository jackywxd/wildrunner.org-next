import type { APIRequestContext } from "@playwright/test";

export const TEST_ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@wildrunner.test",
  password: process.env.E2E_ADMIN_PASSWORD ?? "WildRunnerAdmin1!",
};

export function lexicalParagraph(text: string) {
  return {
    root: {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", text, version: 1 }],
          direction: null,
          format: "",
          indent: 0,
          version: 1,
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      version: 1,
    },
  };
}

/** Ensure an admin user exists (first-user create or no-op if already present). */
export async function ensureAdminUser(request: APIRequestContext) {
  const login = await request.post("/api/users/login", {
    data: {
      email: TEST_ADMIN.email,
      password: TEST_ADMIN.password,
    },
  });

  if (login.ok()) {
    return login;
  }

  const create = await request.post("/api/users", {
    data: {
      email: TEST_ADMIN.email,
      password: TEST_ADMIN.password,
    },
  });

  if (!create.ok() && create.status() !== 400) {
    throw new Error(
      `Failed to create admin user: ${create.status()} ${await create.text()}`,
    );
  }

  const retry = await request.post("/api/users/login", {
    data: {
      email: TEST_ADMIN.email,
      password: TEST_ADMIN.password,
    },
  });

  if (!retry.ok()) {
    throw new Error(
      `Failed to login after create: ${retry.status()} ${await retry.text()}`,
    );
  }

  return retry;
}
