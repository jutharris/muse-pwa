import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, AUDIO_SYSTEM_PROMPT, validateProcessed } from "@/lib/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Audio blobs can be several MB
export const maxDuration = 60;

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "No Anthropic API key configured." },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });
  const model = DEFAULT_MODEL;

  // ── Audio path ──────────────────────────────────────────────────────────────
  // Client sends multipart/form-data with an "audio" file field when the
  // browser Speech API produced no transcript.
  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const audioFile = formData.get("audio") as File | null;
    if (!audioFile || audioFile.size === 0) {
      return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    }

    // Enforce a 25 MB cap to keep latency reasonable
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio too large (max 25 MB)" }, { status: 413 });
    }

    const arrayBuf = await audioFile.arrayBuffer();
    const base64 = Buffer.from(arrayBuf).toString("base64");
    const mimeType = (audioFile.type || "audio/webm") as "audio/webm" | "audio/mp4" | "audio/ogg" | "audio/wav" | "audio/mpeg";

    try {
      const msg = await client.messages.create({
        model,
        max_tokens: 2048,
        system: AUDIO_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Here is a voice recording. Please transcribe it and return the JSON as instructed.",
              },
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: base64,
                },
              } as any,
            ],
          },
        ],
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
        { error: err?.message || "Claude audio request failed" },
        { status: 502 }
      );
    }
  }

  // ── Transcript text path ────────────────────────────────────────────────────
  let body: { transcript?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const transcript = (body.transcript || "").trim();
  if (!transcript) {
    return NextResponse.json({ error: "transcript required" }, { status: 400 });
  }

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
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : text;
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Model did not return valid JSON");
  }
}
