"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Entry } from "./types";

let _client: SupabaseClient | null = null;
let _key = "";
let _url = "";

export function getSupabase(url?: string, anonKey?: string): SupabaseClient | null {
  const finalUrl = url || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const finalKey = anonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  // No credentials available — running without cloud sync
  if (!finalUrl || !finalKey) return null;
  if (_client && _url === finalUrl && _key === finalKey) return _client;
  _client = createClient(finalUrl, finalKey, {
    auth: { persistSession: false },
  });
  _url = finalUrl;
  _key = finalKey;
  return _client;
}

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

// Convert a Supabase row back to a local Entry (no audio blob — not stored in cloud).
export function rowToEntry(row: Record<string, any>): Entry {
  return {
    id: row.id,
    created_at: new Date(row.created_at).getTime(),
    updated_at: new Date(row.updated_at).getTime(),
    raw_transcript: row.raw_transcript ?? "",
    processed: row.processed ?? undefined,
    processing_status: row.processing_status ?? "processed",
    sync_status: "synced",
  };
}
