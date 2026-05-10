"use client";

import Dexie, { type Table } from "dexie";
import { v4 as uuidv4 } from "uuid";
import type { AppSettings, Entry } from "./types";

class MuseDB extends Dexie {
  entries!: Table<Entry, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super("muse");
    this.version(1).stores({
      entries: "id, created_at, sync_status, processing_status, updated_at",
      settings: "id",
    });
  }
}

let _db: MuseDB | null = null;
export function db(): MuseDB {
  if (typeof window === "undefined") {
    throw new Error("MuseDB is browser-only");
  }
  if (!_db) _db = new MuseDB();
  return _db;
}

export async function getSettings(): Promise<AppSettings> {
  const existing = await db().settings.get("singleton");
  if (existing) return existing;
  const fresh: AppSettings = {
    id: "singleton",
    deviceId: uuidv4(),
  };
  await db().settings.put(fresh);
  return fresh;
}


export async function createEntry(input: {
  raw_transcript: string;
  audio_blob?: Blob;
  audio_mime?: string;
  audio_duration_ms?: number;
}): Promise<Entry> {
  const now = Date.now();
  const entry: Entry = {
    id: uuidv4(),
    created_at: now,
    updated_at: now,
    raw_transcript: input.raw_transcript,
    raw_audio_blob: input.audio_blob,
    raw_audio_mime: input.audio_mime,
    raw_audio_duration_ms: input.audio_duration_ms,
    processing_status: "unprocessed",
    sync_status: "pending",
  };
  await db().entries.put(entry);
  return entry;
}

export async function updateEntry(id: string, patch: Partial<Entry>): Promise<void> {
  await db().entries.update(id, { ...patch, updated_at: Date.now() });
}

export async function deleteEntry(id: string): Promise<void> {
  await db().entries.delete(id);
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  return db().entries.get(id);
}

export async function listEntries(): Promise<Entry[]> {
  return db().entries.orderBy("created_at").reverse().toArray();
}

export async function listUnprocessed(): Promise<Entry[]> {
  return db().entries
    .where("processing_status")
    .anyOf(["unprocessed", "process_failed"])
    .toArray();
}

export async function listUnsynced(): Promise<Entry[]> {
  return db().entries
    .where("sync_status")
    .anyOf(["pending", "failed"])
    .toArray();
}
