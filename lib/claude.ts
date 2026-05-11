import type { ProcessedEntry } from "./types";

export const SYSTEM_PROMPT = `You are a personal idea processor. Given a raw voice transcript from a person thinking out loud, return a JSON object with these fields: cleaned_transcript (readable version, fix grammar/filler words), bullet_points (array of 3-7 key insights), ideas_and_research (array of follow-up ideas, questions to explore, or things to research), category (one of: business, health, creative, newsletter, life, other), title (5 words or fewer). Return only valid JSON, no markdown.`;

export function validateProcessed(obj: unknown): ProcessedEntry & { raw_transcript?: string } {
  if (!obj || typeof obj !== "object") throw new Error("Not an object");
  const o = obj as Record<string, unknown>;
  const cleaned = String(o.cleaned_transcript ?? "").trim();
  const bullets = Array.isArray(o.bullet_points) ? (o.bullet_points as unknown[]).map(String) : [];
  const ideas = Array.isArray(o.ideas_and_research) ? (o.ideas_and_research as unknown[]).map(String) : [];
  const cat = String(o.category ?? "other").toLowerCase();
  const allowed = ["business", "health", "creative", "newsletter", "life", "other"];
  const category = (allowed.includes(cat) ? cat : "other") as ProcessedEntry["category"];
  const title = String(o.title ?? "Untitled").split(/\s+/).slice(0, 7).join(" ").trim() || "Untitled";
  const raw_transcript = o.raw_transcript ? String(o.raw_transcript).trim() : undefined;
  if (!cleaned) throw new Error("cleaned_transcript missing");
  return { cleaned_transcript: cleaned, bullet_points: bullets, ideas_and_research: ideas, category, title, raw_transcript };
}

// Send audio blob to server — Whisper transcribes, Claude processes.
export async function processAudio(blob: Blob, mimeType: string): Promise<ProcessedEntry & { raw_transcript?: string }> {
  const ext = mimeToExt(mimeType);
  const form = new FormData();
  form.append("audio", new File([blob], `recording.${ext}`, { type: mimeType }));
  const res = await fetch("/api/process", { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Audio process failed (${res.status}): ${text || res.statusText}`);
  }
  return validateProcessed(await res.json());
}

function mimeToExt(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("flac")) return "flac";
  return "webm"; // default — Chrome/Android
}

// Send a plain text transcript to Claude for processing.
export async function processTranscript(transcript: string): Promise<ProcessedEntry> {
  const res = await fetch("/api/process", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transcript }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Process failed (${res.status}): ${text || res.statusText}`);
  }
  return validateProcessed(await res.json());
}
