import type { Endpoint } from "payload";
import { APIError } from "payload";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { lexicalParagraph, paragraphsToLexical } from "@/lib/lexical-helpers";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

async function checkRateLimit(db: D1Database, key: string): Promise<void> {
  const now = Date.now();
  const result = await db
    .prepare(
      `INSERT INTO ai_rate_limits (key, count, reset_at)
       VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE
           WHEN ai_rate_limits.reset_at < ?3 THEN 1
           ELSE ai_rate_limits.count + 1
         END,
         reset_at = CASE
           WHEN ai_rate_limits.reset_at < ?3 THEN ?2
           ELSE ai_rate_limits.reset_at
         END
       RETURNING count`,
    )
    .bind(key, now + WINDOW_MS, now)
    .first<{ count: number }>();

  if ((result?.count ?? 1) > MAX_PER_WINDOW) {
    throw new APIError("Too many AI requests", 429);
  }
}

type ExpandBody = {
  title?: string;
  description?: string;
  outline?: string;
  partialContent?: string;
};

export const aiExpandPostEndpoint: Endpoint = {
  path: "/ai/expand-post",
  method: "post",
  handler: async (req) => {
    if (!req.user) {
      throw new APIError("Unauthorized", 401);
    }

    let body: ExpandBody;
    try {
      body = (await req.json?.()) as ExpandBody;
    } catch {
      throw new APIError("Invalid JSON body", 400);
    }

    const outline = (body.outline ?? body.partialContent ?? "").trim();
    const title = (body.title ?? "").trim();
    const description = (body.description ?? "").trim();

    if (!outline && !title && !description) {
      throw new APIError("outline or partialContent is required", 400);
    }

    const { env } = await getCloudflareContext({ async: true });
    // Keyed on the user alone, not user+IP: every member gets their own AI
    // budget regardless of network, and switching IP/UA can't reset it.
    await checkRateLimit(env.D1, String(req.user.id));
    const ai = env.AI;

    const prompt = [
      "你是一位中文越野跑与马拉松专栏作者，请根据用户提供的信息扩写为完整文章草稿。",
      "只输出正文段落，不要标题，不要自动发布说明。",
      title ? `标题：${title}` : "",
      description ? `摘要：${description}` : "",
      outline ? `大纲或片段：\n${outline}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    let expandedText = outline;

    if (process.env.NEXTJS_ENV === "test") {
      expandedText = `${outline}\n\n这是根据大纲生成的中文测试扩写段落，用于验证草稿写入，不会自动发布。`;
    } else if (
      process.env.NODE_ENV === "production" ||
      process.env.AI_IN_DEV === "true"
    ) {
      try {
        const response = await ai.run(
          "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
          {
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
            max_tokens: 1200,
          },
        );
        const text =
          typeof response === "object" && response && "response" in response
            ? String((response as { response?: string }).response ?? "")
            : String(response);
        if (text.trim()) {
          expandedText = text.trim();
        }
      } catch (error) {
        // Keep original outline on AI failure (P4-T7)
        console.warn(
          "Workers AI expand failed, falling back to outline",
          error,
        );
      }
    } else {
      expandedText = `${outline}\n\n（本地开发未绑定 Workers AI，返回扩写占位段落。）`;
    }

    const paragraphs = expandedText
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    const content =
      paragraphs.length > 1
        ? paragraphsToLexical(paragraphs)
        : lexicalParagraph(expandedText || outline);

    return Response.json({
      content,
      expandedLength: expandedText.length,
    });
  },
};
