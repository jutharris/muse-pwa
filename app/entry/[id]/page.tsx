"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, deleteEntry } from "@/lib/db";
import { processPendingEntries, syncPendingEntries } from "@/lib/sync";
import CategoryBadge from "@/components/CategoryBadge";

export default function EntryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const entry = useLiveQuery(() => db().entries.get(params.id), [params.id]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<"clean" | "raw" | "bullets" | "ideas">("clean");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!entry?.raw_audio_blob) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(entry.raw_audio_blob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [entry?.raw_audio_blob]);

  const isProcessed = entry?.processing_status === "processed";

  const reprocess = async () => {
    if (!entry) return;
    setBusy(true);
    try {
      await db().entries.update(entry.id, { processing_status: "unprocessed", processing_error: undefined });
      await processPendingEntries();
      await syncPendingEntries();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!entry) return;
    if (!confirm("Delete this entry? This cannot be undone.")) return;
    await deleteEntry(entry.id);
    router.replace("/");
  };

  const tabs = useMemo(
    () => [
      { id: "clean" as const, label: "Cleaned" },
      { id: "bullets" as const, label: "Bullets" },
      { id: "ideas" as const, label: "Ideas" },
      { id: "raw" as const, label: "Raw" },
    ],
    []
  );

  if (entry === undefined) {
    return (
      <main className="mx-auto max-w-xl px-4 pt-6 pb-12 text-ink-400 text-sm">Loading…</main>
    );
  }
  if (entry === null) {
    return (
      <main className="mx-auto max-w-xl px-4 pt-6 pb-12 text-ink-400 text-sm">
        Not found. <Link href="/" className="text-accent">Back</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 pt-4 pb-24">
      <div className="flex items-center justify-between mb-3">
        <Link href="/" className="text-ink-400 text-sm">← Back</Link>
        <button onClick={remove} className="text-red-300/80 text-sm">Delete</button>
      </div>

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold leading-tight">
          {entry.processed?.title || (entry.processing_status === "processing" ? "Processing…" : "Untitled")}
        </h1>
        {entry.processed?.category && <CategoryBadge category={entry.processed.category} />}
      </div>
      <p className="mt-1 text-xs text-ink-400">
        {new Date(entry.created_at).toLocaleString()}
        {entry.raw_audio_duration_ms ? ` · ${Math.round(entry.raw_audio_duration_ms / 1000)}s` : ""}
      </p>

      {entry.processing_status !== "processed" && (
        <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex items-center justify-between">
          <span>
            {entry.processing_status === "processing"
              ? "Processing with Claude…"
              : entry.processing_status === "process_failed"
                ? `Process failed: ${entry.processing_error ?? "unknown"}`
                : "Awaiting processing (will run when online)."}
          </span>
          <button onClick={reprocess} disabled={busy} className="ml-3 text-amber-100 underline disabled:opacity-50">
            {busy ? "…" : "Retry"}
          </button>
        </div>
      )}

      {audioUrl && (
        <audio controls src={audioUrl} className="mt-4 w-full" preload="metadata" />
      )}

      <div className="mt-5 flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap text-xs uppercase tracking-wider px-3 py-1.5 rounded-full border transition ${
              tab === t.id
                ? "bg-accent text-ink-950 border-accent"
                : "bg-ink-900 text-ink-400 border-ink-700/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="mt-4 rounded-2xl bg-ink-900/70 border border-ink-700/40 p-4 text-[15px] leading-relaxed">
        {tab === "clean" && (
          <p className="whitespace-pre-wrap text-ink-100">
            {entry.processed?.cleaned_transcript || (isProcessed ? "(empty)" : entry.raw_transcript || "(empty)")}
          </p>
        )}
        {tab === "raw" && (
          <p className="whitespace-pre-wrap text-ink-200">
            {entry.raw_transcript || "(empty)"}
          </p>
        )}
        {tab === "bullets" && (
          (entry.processed?.bullet_points?.length ?? 0) === 0 ? (
            <p className="text-ink-400 text-sm">No bullet points yet.</p>
          ) : (
            <ul className="space-y-2">
              {entry.processed!.bullet_points.map((b, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-accent mt-2 inline-block h-1.5 w-1.5 rounded-full flex-shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )
        )}
        {tab === "ideas" && (
          (entry.processed?.ideas_and_research?.length ?? 0) === 0 ? (
            <p className="text-ink-400 text-sm">No follow-up ideas yet.</p>
          ) : (
            <ul className="space-y-2">
              {entry.processed!.ideas_and_research.map((b, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-accent/80 mt-2 inline-block h-1.5 w-1.5 rounded-full flex-shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )
        )}
      </section>
    </main>
  );
}
