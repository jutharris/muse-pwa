import type { ProcessedEntry } from "./types";

export const SYSTEM_PROMPT = `You are a personal idea processor. Given a raw voice transcript from a person thinking out loud, return a JSON object with these fields: cleaned_transcript (readable version, fix grammar/filler words), bullet_points (array of 3-7 key insights), ideas_and_research (array of follow-up ideas, questions to explore, or things to research), category (one of: business, health, creative, newsletter, life, other), title (5 words or fewer). Return only valid JSON, no markdown.`;

export interface ProcessRequest {
  transcript: string;
  apiKey?: string;     // optional override from client settings
  model?: string;
}

export function validateProcessed(obj: unknown): ProcessedEntry {
  if (!obj || typeof obj !== "object") throw new Error("Not an object");
  const o = obj as Record<string, unknown>;
  const cleaned = String(o.cleaned_transcript ?? "").trim();
  const bullets = Array.isArray(o.bullet_points) ? (o.bullet_points as unknown[]).map(String) : [];
  const ideas = Array.isArray(o.ideas_and_research) ? (o.ideas_and_research as unknown[]).map(String) : [];
  const cat = String(o.category ?? "other").toLowerCase();
  const allowed = ["business", "health", "creative", "newsletter", "life", "other"];
  const category = (allowed.includes(cat) ? cat : "other") as ProcessedEntry["category"];
  const title = String(o.title ?? "Untitled").split(/\s+/).slice(0, 7).join(" ").trim() || "Untitled";
  if (!cleaned) throw new Error("cleaned_transcript missing");
  return {
    cleaned_transcript: cleaned,
    bullet_points: bullets,
    ideas_and_research: ideas,
    category,
    title,
  };
}

// Client helper – calls our /api/process route.
export async function processTranscript(
  transcript: string,
  opts: { apiKey?: string } = {}
): Promise<ProcessedEntry> {
  const res = await fetch("/api/process", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transcript, apiKey: opts.apiKey }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Process failed (${res.status}): ${text || res.statusText}`);
  }
  const data = await res.json();
  return validateProcessed(data);
}
