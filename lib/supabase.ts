"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Entry } from "./types";

let _client: SupabaseClient | null = null;
let _key = "";
let _url = "";

export function getSupabase(url?: string, anonKey?: string): SupabaseClient | null {
  const finalUrl = url || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const finalKey = anonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!finalUrl || !finalKey) return null;
  if (_client && _url === finalUrl && _key === finalKey) return _client;
  _client = createClient(finalUrl, finalKey, {
    auth: { persistSession: false },
  });
  _url = finalUrl;
  _key = finalKey;
  return _client;
}

// Map a local Entry to the row shape stored in Supabase.
// Audio blob is intentionally not synced (size + privacy). If you want audio
// in cloud, upload to Supabase Storage from sync.ts and store the path here.
export function entryToRow(entry: Entry, deviceId: string) {
  return {
    id: entry.id,
    created_at: new Date(entry.created_at).toISOString(),
    updated_at: new Date(entry.updated_at).toISOString(),
    raw_transcript: entry.raw_transcript,
    raw_audio_path: null as string | null,
    processed: entry.processed ?? null,
    processing_status: entry.processing_status,
    device_id: deviceId,
  };
}
