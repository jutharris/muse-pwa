"use client";

import {
  getSettings,
  listUnprocessed,
  listUnsynced,
  updateEntry,
} from "./db";
import { processTranscript } from "./claude";
import { entryToRow, getSupabase } from "./supabase";
import type { Entry } from "./types";

let runningProcess = false;
let runningSync = false;

export async function processPendingEntries(): Promise<{ processed: number; failed: number }> {
  if (runningProcess) return { processed: 0, failed: 0 };
  runningProcess = true;
  let processed = 0;
  let failed = 0;
  try {
    const pending = await listUnprocessed();
    for (const entry of pending) {
      if (!entry.raw_transcript || entry.raw_transcript.trim().length === 0) {
        await updateEntry(entry.id, {
          processing_status: "process_failed",
          processing_error: "Empty transcript",
        });
        failed++;
        continue;
      }
      await updateEntry(entry.id, { processing_status: "processing" });
      try {
        const result = await processTranscript(entry.raw_transcript);
        await updateEntry(entry.id, {
          processed: result,
          processing_status: "processed",
          processing_error: undefined,
          sync_status: "pending",
        });
        processed++;
      } catch (err) {
        await updateEntry(entry.id, {
          processing_status: "process_failed",
          processing_error: (err as Error).message,
        });
        failed++;
      }
    }
  } finally {
    runningProcess = false;
  }
  return { processed, failed };
}

// Push a single entry to Supabase immediately. Used right after save.
export async function pushEntryNow(entry: Entry): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !navigator.onLine) return;
  const settings = await getSettings();
  const row = entryToRow(entry, settings.deviceId);
  const { error } = await supabase.from("entries").upsert(row, { onConflict: "id" });
  if (error) throw error;
  await updateEntry(entry.id, { sync_status: "synced", sync_error: undefined });
}

export async function syncPendingEntries(): Promise<{ synced: number; failed: number }> {
  if (runningSync) return { synced: 0, failed: 0 };
  runningSync = true;
  let synced = 0;
  let failed = 0;
  try {
    const supabase = getSupabase();
    if (!supabase) return { synced: 0, failed: 0 };

    const settings = await getSettings();
    const pending = await listUnsynced();
    for (const entry of pending) {
      try {
        const row = entryToRow(entry, settings.deviceId);
        const { error } = await supabase.from("entries").upsert(row, { onConflict: "id" });
        if (error) throw error;
        await updateEntry(entry.id, { sync_status: "synced", sync_error: undefined });
        synced++;
      } catch (err) {
        await updateEntry(entry.id, {
          sync_status: "failed",
          sync_error: (err as Error).message,
        });
        failed++;
      }
    }
  } finally {
    runningSync = false;
  }
  return { synced, failed };
}

export async function runFullSync(): Promise<void> {
  await processPendingEntries();
  if (typeof navigator !== "undefined" && navigator.onLine) {
    await syncPendingEntries();
  }
}

export function registerSyncListeners(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const onOnline = () => {
    runFullSync().finally(onChange);
  };
  const onVis = () => {
    if (document.visibilityState === "visible") runFullSync().finally(onChange);
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVis);

  if ("serviceWorker" in navigator && "SyncManager" in window) {
    navigator.serviceWorker.ready
      .then((reg) => (reg as any).sync?.register("muse-sync"))
      .catch(() => {});
  }

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVis);
  };
}
