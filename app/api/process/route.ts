import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, validateProcessed } from "@/lib/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

export async function POST(req: NextRequest) {
  let body: { transcript?: string; apiKey?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const transcript = (body.transcript || "").trim();
  if (!transcript) {
    return NextResponse.json({ error: "transcript required" }, { status: 400 });
  }

  const apiKey = body.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Anthropic API key configured (server env or settings)." },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });
  const model = body.model || DEFAULT_MODEL;

  try {
    const msg = await client.messages.create({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript }],
    });

    const text = msg.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();

    const json = extractJson(text);
    const processed = validateProcessed(json);
    return NextResponse.json(processed);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Claude request failed" },
      { status: 502 }
    );
  }
}

function extractJson(text: string): unknown {
  // Allow accidental markdown fencing.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : text;
  try {
    return JSON.parse(raw);
  } catch {
    // Try to find the first {...} block.
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Model did not return valid JSON");
  }
}
