import type { APIRequestContext } from "@playwright/test";

export async function expectOkJson<T = any>(
  response: import("@playwright/test").APIResponse,
): Promise<T> {
  const text = await response.text();
  if (!response.ok()) {
    throw new Error(text);
  }
  return JSON.parse(text) as T;
}

export async function uploadMedia(
  request: APIRequestContext,
  opts: {
    alt: string;
    name: string;
    mimeType: string;
    buffer: Buffer;
  },
) {
  const response = await request.post("/api/media", {
    multipart: {
      file: {
        name: opts.name,
        mimeType: opts.mimeType,
        buffer: opts.buffer,
      },
      _payload: JSON.stringify({ alt: opts.alt }),
    },
  });
  const body = await expectOkJson<{ doc?: any } & Record<string, unknown>>(
    response,
  );
  return body.doc ?? body;
}
