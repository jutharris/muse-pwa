"use client";

import {
  getSettings,
  listUnprocessed,
  listUnsynced,
  updateEntry,
} from "./db";
import { processTranscript } from "./claude";
import { entryToRow, getSupabase } from "./supabase";

let runningProcess = false;
let runningSync = false;

export async function processPendingEntries(): Promise<{ processed: number; failed: number }> {
  if (runningProcess) return { processed: 0, failed: 0 };
  runningProcess = true;
  let processed = 0;
  let failed = 0;
  try {
    const settings = await getSettings();
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
        const result = await processTranscript(entry.raw_transcript, {
          apiKey: settings.anthropicApiKey,
        });
        await updateEntry(entry.id, {
          processed: result,
          processing_status: "processed",
          processing_error: undefined,
          sync_status: "pending", // re-mark for sync now that processed exists
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

export async function syncPendingEntries(): Promise<{ synced: number; failed: number }> {
  if (runningSync) return { synced: 0, failed: 0 };
  runningSync = true;
  let synced = 0;
  let failed = 0;
  try {
    const settings = await getSettings();
    if (!settings.syncEnabled) return { synced: 0, failed: 0 };

    const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
    if (!supabase) return { synced: 0, failed: 0 };

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

  // Best-effort Background Sync registration (Chromium PWAs).
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
