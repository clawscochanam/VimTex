import { buildSystemPrompt } from "@/lib/ai-chat";
import { DEFAULT_AI_MODEL, isAiModelId } from "@/lib/ai-models";

export const runtime = "nodejs";

type ChatRequestBody = {
  /** Preferred: single @ai instruction (no chat history). */
  instruction?: string;
  document?: string;
  model?: string;
};

type OpenRouterMessage = {
  role: string;
  content: string | null;
};

export async function POST(req: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "OPENROUTER_API_KEY is not set. Add it to .env or .env.local and restart the server.",
      },
      { status: 500 },
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const instruction =
    typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) {
    return Response.json(
      { error: "instruction must be a non-empty string." },
      { status: 400 },
    );
  }

  const model =
    typeof body.model === "string" && isAiModelId(body.model)
      ? body.model
      : DEFAULT_AI_MODEL;

  const document = typeof body.document === "string" ? body.document : "";

  const openRouterMessages: OpenRouterMessage[] = [
    { role: "system", content: buildSystemPrompt(document) },
    { role: "user", content: instruction },
  ];

  let upstream: Response;
  try {
    upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://vimtex.local",
        "X-Title": "VimTex",
      },
      body: JSON.stringify({
        model,
        messages: openRouterMessages,
        temperature: 0.4,
      }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Network error";
    return Response.json(
      { error: `Failed to reach OpenRouter: ${detail}` },
      { status: 502 },
    );
  }

  const rawText = await upstream.text();
  let data: {
    choices?: { message?: { content?: string | null } }[];
    error?: { message?: string };
  };
  try {
    data = JSON.parse(rawText) as typeof data;
  } catch {
    return Response.json(
      {
        error: `OpenRouter returned non-JSON (${upstream.status}).`,
      },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const msg =
      data.error?.message ||
      `OpenRouter error ${upstream.status}`;
    return Response.json({ error: msg }, { status: 502 });
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    return Response.json(
      { error: "Model returned an empty reply." },
      { status: 502 },
    );
  }

  return Response.json({
    message: content,
    model,
  });
}
