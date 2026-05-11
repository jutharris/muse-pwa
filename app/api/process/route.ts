import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { SYSTEM_PROMPT, validateProcessed } from "@/lib/claude";
import { Readable } from "stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

export async function POST(req: NextRequest) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured." }, { status: 400 });
  }

  const contentType = req.headers.get("content-type") || "";

  // ── Audio path: Whisper → transcript → Claude ──────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    if (!openaiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured. Add it to Vercel env vars to enable audio transcription." },
        { status: 400 }
      );
    }

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
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio too large (max 25 MB)" }, { status: 413 });
    }

    // Step 1: Whisper transcription
    let rawTranscript: string;
    try {
      const openai = new OpenAI({ apiKey: openaiKey });
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        response_format: "text",
      });
      rawTranscript = (transcription as unknown as string).trim();
    } catch (err: any) {
      return NextResponse.json(
        { error: `Transcription failed: ${err?.message || "Whisper error"}` },
        { status: 502 }
      );
    }

    if (!rawTranscript) {
      return NextResponse.json({ error: "No speech detected in recording." }, { status: 422 });
    }

    // Step 2: Claude processing
    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const msg = await anthropic.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: rawTranscript }],
      });
      const text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
      const processed = validateProcessed(extractJson(text));
      return NextResponse.json({ ...processed, raw_transcript: rawTranscript });
    } catch (err: any) {
      return NextResponse.json({ error: `Claude processing failed: ${err?.message}` }, { status: 502 });
    }
  }

  // ── Text transcript path ────────────────────────────────────────────────────
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
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const msg = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript }],
    });
    const text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
    const processed = validateProcessed(extractJson(text));
    return NextResponse.json(processed);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Claude request failed" }, { status: 502 });
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
