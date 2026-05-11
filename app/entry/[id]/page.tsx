"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, deleteEntry, updateEntry } from "@/lib/db";
import { processAudio, processTranscript } from "@/lib/claude";
import { pushEntryNow } from "@/lib/sync";
import CategoryBadge from "@/components/CategoryBadge";
import AppendRecorder from "@/components/AppendRecorder";

export default function EntryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const entry = useLiveQuery(() => db().entries.get(params.id), [params.id]);
  const [tab, setTab] = useState<"clean" | "raw" | "bullets" | "ideas">("clean");
  const [busy, setBusy] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [showAppend, setShowAppend] = useState(false);

  const reprocess = async () => {
    if (!entry) return;
    setBusy(true);
    try {
      await updateEntry(entry.id, { processing_status: "processing", processing_error: undefined });
      let processed: Awaited<ReturnType<typeof processAudio>>;
      if (entry.raw_audio_blob && entry.raw_audio_mime) {
        processed = await processAudio(entry.raw_audio_blob, entry.raw_audio_mime);
      } else {
        processed = await processTranscript(entry.raw_transcript);
      }
      const finalTranscript = processed.raw_transcript || entry.raw_transcript;
      await updateEntry(entry.id, {
        raw_transcript: finalTranscript,
        processed,
        processing_status: "processed",
        processing_error: undefined,
        raw_audio_blob: undefined,
        sync_status: "pending",
      });
      pushEntryNow({ ...entry, raw_transcript: finalTranscript, processed, processing_status: "processed", sync_status: "pending" }).catch(() => {});
    } catch (err) {
      await updateEntry(entry.id, { processing_status: "process_failed", processing_error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const saveTranscriptEdit = async () => {
    if (!entry) return;
    const text = transcriptDraft.trim();
    if (!text) return;
    setEditingTranscript(false);
    setBusy(true);
    try {
      await updateEntry(entry.id, { processing_status: "processing", processing_error: undefined });
      const processed = await processTranscript(text);
      await updateEntry(entry.id, {
        raw_transcript: text,
        processed,
        processing_status: "processed",
        processing_error: undefined,
        sync_status: "pending",
      });
      pushEntryNow({ ...entry, raw_transcript: text, processed, processing_status: "processed", sync_status: "pending" }).catch(() => {});
    } catch (err) {
      await updateEntry(entry.id, { processing_status: "process_failed", processing_error: (err as Error).message });
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

  const tabs = useMemo(() => [
    { id: "clean" as const, label: "Cleaned" },
    { id: "bullets" as const, label: "Bullets" },
    { id: "ideas" as const, label: "Ideas" },
    { id: "raw" as const, label: "Raw" },
  ], []);

  if (entry === undefined) return <main className="mx-auto max-w-xl px-4 pt-6 pb-12 text-ink-400 text-sm">Loading…</main>;
  if (entry === null) return (
    <main className="mx-auto max-w-xl px-4 pt-6 pb-12 text-ink-400 text-sm">
      Not found. <Link href="/" className="text-accent">Back</Link>
    </main>
  );

  const isProcessed = entry.processing_status === "processed";

  return (
    <>
      {showAppend && entry && (
        <AppendRecorder
          entry={entry}
          onDone={() => setShowAppend(false)}
          onCancel={() => setShowAppend(false)}
        />
      )}

      <main className="mx-auto max-w-xl px-4 pt-4 pb-24">
        <div className="flex items-center justify-between mb-3">
          <Link href="/" className="text-ink-400 text-sm">← Back</Link>
          <button onClick={remove} className="text-red-300/80 text-sm">Delete</button>
        </div>

        <div className="flex items-start justify-between gap-3">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={async () => {
                const t = titleDraft.trim();
                if (t && entry.processed) {
                  await updateEntry(entry.id, { processed: { ...entry.processed, title: t }, sync_status: "pending" });
                  pushEntryNow({ ...entry, processed: { ...entry.processed, title: t }, sync_status: "pending" }).catch(() => {});
                }
                setEditingTitle(false);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingTitle(false); }}
              className="flex-1 text-xl font-semibold bg-transparent border-b border-accent focus:outline-none text-ink-100 pb-0.5"
            />
          ) : (
            <h1
              className="text-xl font-semibold leading-tight cursor-text"
              onClick={() => {
                if (!entry.processed) return;
                setTitleDraft(entry.processed.title);
                setEditingTitle(true);
              }}
              title="Tap to edit title"
            >
              {entry.processed?.title || (entry.processing_status === "processing" ? "Processing…" : "Untitled")}
            </h1>
          )}
          {entry.processed?.category && <CategoryBadge category={entry.processed.category} />}
        </div>
        <p className="mt-1 text-xs text-ink-400">
          {new Date(entry.created_at).toLocaleString()}
          {entry.raw_audio_duration_ms ? ` · ${Math.round(entry.raw_audio_duration_ms / 1000)}s` : ""}
        </p>

        {entry.processing_status === "processing" && (
          <div className="mt-3 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-accent">
            Sending to Claude for transcription and processing…
          </div>
        )}

        {entry.processing_status === "process_failed" && (
          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex items-center justify-between">
            <span>Failed: {entry.processing_error ?? "unknown error"}</span>
            <button onClick={reprocess} disabled={busy} className="ml-3 text-amber-100 underline disabled:opacity-50">
              {busy ? "Retrying…" : "Retry"}
            </button>
          </div>
        )}

        {entry.processing_status === "unprocessed" && (
          <div className="mt-3 rounded-xl border border-ink-700/40 bg-ink-900/60 px-3 py-2 text-xs text-ink-300 flex items-center justify-between">
            <span>Queued for processing</span>
            <button onClick={reprocess} disabled={busy} className="ml-3 text-ink-100 underline disabled:opacity-50">
              {busy ? "Processing…" : "Process now"}
            </button>
          </div>
        )}

        {busy && (
          <div className="mt-3 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-accent flex items-center gap-2">
            <span className="h-3 w-3 rounded-full border border-accent border-t-transparent animate-spin flex-shrink-0" />
            Reprocessing with Claude…
          </div>
        )}

        {isProcessed && (
          <>
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

            <div className="mt-4 rounded-2xl bg-ink-900/70 border border-ink-700/40 p-4 text-[15px] leading-relaxed relative">
              {tab === "clean" && (
                editingTranscript ? (
                  <>
                    <textarea
                      autoFocus
                      value={transcriptDraft}
                      onChange={(e) => setTranscriptDraft(e.target.value)}
                      rows={8}
                      className="w-full bg-transparent text-ink-100 text-[15px] leading-relaxed resize-none focus:outline-none"
                    />
                    <div className="flex gap-2 mt-3 justify-end">
                      <button
                        onClick={() => setEditingTranscript(false)}
                        className="text-xs text-ink-400 px-3 py-1.5 rounded-lg border border-ink-700/40 bg-transparent"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveTranscriptEdit}
                        disabled={busy}
                        className="text-xs font-semibold text-ink-950 px-4 py-1.5 rounded-lg bg-accent disabled:opacity-50 flex items-center gap-1.5"
                      >
                        ✨ Save &amp; reprocess
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-ink-100 pr-12">{entry.processed?.cleaned_transcript || "(empty)"}</p>
                    <button
                      onClick={() => {
                        setTranscriptDraft(entry.processed?.cleaned_transcript || "");
                        setEditingTranscript(true);
                      }}
                      className="absolute bottom-3 right-3 text-[11px] text-ink-500 bg-ink-800 border border-ink-700/40 px-2.5 py-1 rounded-lg"
                    >
                      Edit ✏
                    </button>
                  </>
                )
              )}
              {tab === "raw" && (
                <p className="whitespace-pre-wrap text-ink-200">{entry.raw_transcript || "(empty)"}</p>
              )}
              {tab === "bullets" && (
                (entry.processed?.bullet_points?.length ?? 0) === 0
                  ? <p className="text-ink-400 text-sm">No bullet points.</p>
                  : <ul className="space-y-2">
                      {entry.processed!.bullet_points.map((b, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="text-accent mt-2 inline-block h-1.5 w-1.5 rounded-full flex-shrink-0" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
              )}
              {tab === "ideas" && (
                (entry.processed?.ideas_and_research?.length ?? 0) === 0
                  ? <p className="text-ink-400 text-sm">No follow-up ideas.</p>
                  : <ul className="space-y-2">
                      {entry.processed!.ideas_and_research.map((b, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="text-accent/80 mt-2 inline-block h-1.5 w-1.5 rounded-full flex-shrink-0" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
              )}
            </div>

            {/* Add more button — always visible below content */}
            {!editingTranscript && (
              <button
                onPointerDown={() => setShowAppend(true)}
                className="mt-3 w-full flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-2xl border border-dashed border-accent/35 bg-accent/5 text-accent text-sm font-medium active:bg-accent/10 transition-colors"
              >
                <MicIcon />
                Add more to this thought
              </button>
            )}
          </>
        )}
      </main>
    </>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}
