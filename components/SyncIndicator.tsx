"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";

export default function SyncIndicator() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const counts = useLiveQuery(async () => {
    const all = await db().entries.toArray();
    return {
      pending: all.filter((e) => e.sync_status === "pending").length,
      failed: all.filter((e) => e.sync_status === "failed").length,
      unprocessed: all.filter((e) => e.processing_status === "unprocessed" || e.processing_status === "processing").length,
    };
  }, []);

  const tone =
    !online || (counts && counts.failed > 0)
      ? "bg-red-400"
      : counts && (counts.pending > 0 || counts.unprocessed > 0)
        ? "bg-amber-400"
        : "bg-emerald-400";

  const label = !online
    ? "Offline"
    : counts && counts.failed > 0
      ? `${counts.failed} failed`
      : counts && (counts.pending > 0 || counts.unprocessed > 0)
        ? `${counts.pending + counts.unprocessed} pending`
        : "Synced";

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-ink-400">
      <span className={`inline-block h-2 w-2 rounded-full ${tone}`} />
      <span>{label}</span>
    </div>
  );
}
