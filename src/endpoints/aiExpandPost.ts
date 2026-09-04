import type { Endpoint } from "payload";
import { APIError } from "payload";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { lexicalParagraph, paragraphsToLexical } from "@/lib/lexical-helpers";

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

    const { env } = await getCloudflareContext({ async: true });
    // Before the body is even parsed, and shared with /ai/improve-post so a
    // member has one AI budget rather than one per endpoint. Both reasons in
    // src/lib/ai/rate-limit.ts.
    await checkAiRateLimit(env.D1, String(req.user.id));

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

    const ai = env.AI;

    const prompt = [
      "你是一位中文越野跑與馬拉松專欄作者，請根據使用者提供的資訊擴寫為完整文章草稿。",
      "只輸出正文段落，不要標題，不要自動發布說明。",
      title ? `標題：${title}` : "",
      description ? `摘要：${description}` : "",
      outline ? `大綱或片段：\n${outline}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    let expandedText = outline;

    if (process.env.NEXTJS_ENV === "test") {
      expandedText = `${outline}\n\n這是根據大綱生成的中文測試擴寫段落，用於驗證草稿寫入，不會自動發布。`;
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
      expandedText = `${outline}\n\n（本地開發未綁定 Workers AI，回傳擴寫佔位段落。）`;
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
