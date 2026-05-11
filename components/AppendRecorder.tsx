"use client";

import { useRef, useState } from "react";
import { startRecorder, type RecorderHandle, SILENCE_TIMEOUT_MS } from "@/lib/speech";
import { updateEntry } from "@/lib/db";
import { pushEntryNow } from "@/lib/sync";
import { processAudio, processTranscript } from "@/lib/claude";
import WaveformVisualizer from "./WaveformVisualizer";
import type { Entry } from "@/lib/types";

interface Props {
  entry: Entry;
  onDone: () => void;
  onCancel: () => void;
}

export default function AppendRecorder({ entry, onDone, onCancel }: Props) {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [warn, setWarn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const handleRef = useRef<RecorderHandle | null>(null);
  const startedAt = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  const startTimer = () => {
    startedAt.current = Date.now();
    tickRef.current = window.setInterval(() => {
      setElapsed(Date.now() - startedAt.current);
    }, 250);
  };
  const stopTimer = () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
  };

  const begin = async () => {
    setError(null);
    setWarn(null);
    try {
      const handle = await startRecorder({
        onLevel: setLevel,
        onAutoStopWarning: (msSince) => {
          const left = Math.max(0, Math.ceil((SILENCE_TIMEOUT_MS - msSince) / 1000));
          setWarn(`Auto-stopping in ${left}s of silence`);
        },
      });
      handleRef.current = handle;
      setRecording(true);
      startTimer();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const stop = async () => {
    if (!handleRef.current || !recording) return;
    setRecording(false);
    stopTimer();
    const handle = handleRef.current;
    handleRef.current = null;

    setBusy(true);
    try {
      const result = await handle.stop();
      if (!result.audioBlob) {
        setError("Nothing captured — check mic permissions and try again.");
        setBusy(false);
        return;
      }

      // Transcribe new audio
      const newProcessed = await processAudio(result.audioBlob, result.audioMime || "audio/webm");
      const newTranscript = newProcessed.raw_transcript || "";

      if (!newTranscript.trim()) {
        setError("No speech detected in this recording.");
        setBusy(false);
        return;
      }

      // Combine with existing transcript
      const existingTranscript = entry.raw_transcript || "";
      const combined = existingTranscript
        ? `${existingTranscript}\n\n${newTranscript}`
        : newTranscript;

      // Reprocess combined transcript
      await updateEntry(entry.id, { processing_status: "processing", processing_error: undefined });
      const reprocessed = await processTranscript(combined);

      await updateEntry(entry.id, {
        raw_transcript: combined,
        processed: reprocessed,
        processing_status: "processed",
        processing_error: undefined,
        sync_status: "pending",
      });

      pushEntryNow({
        ...entry,
        raw_transcript: combined,
        processed: reprocessed,
        processing_status: "processed",
        sync_status: "pending",
      }).catch(() => {});

      onDone();
    } catch (err) {
      setError((err as Error).message);
      await updateEntry(entry.id, {
        processing_status: "process_failed",
        processing_error: (err as Error).message,
      });
      setBusy(false);
    }
  };

  const cancel = () => {
    handleRef.current?.cancel();
    handleRef.current = null;
    stopTimer();
    setRecording(false);
    onCancel();
  };

  const title = entry.processed?.title || "this thought";

  if (!recording && !busy) {
    // Pre-recording confirmation screen
    return (
      <div
        className="fixed inset-0 z-50 bg-ink-950 flex flex-col"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
      >
        <div
          className="flex items-center justify-between px-5 pb-2 flex-shrink-0"
          style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}
        >
          <button onPointerDown={cancel} className="text-ink-400 text-sm py-2 pr-4">
            Cancel
          </button>
          <span className="text-sm font-semibold text-ink-100">Add to thought</span>
          <div className="w-16" />
        </div>

        <div className="mx-5 mt-3 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 flex-shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-accent mb-1">Appending to</p>
          <p className="text-sm text-ink-300 leading-snug">
            "{title}" — your new recording will be combined with the existing transcript and reprocessed.
          </p>
        </div>

        <div className="flex-1" />

        <div className="flex flex-col items-center gap-3 px-5 pb-6 flex-shrink-0">
          {error && <p className="text-xs text-red-300 text-center">{error}</p>}
          <button
            onPointerDown={begin}
            className="h-20 w-20 rounded-full bg-accent text-ink-950 shadow-[0_10px_40px_-5px_rgba(249,115,115,0.7)] active:scale-95 transition-transform flex items-center justify-center"
            aria-label="Start recording"
          >
            <MicIcon />
          </button>
          <p className="text-[11px] text-ink-500">Tap to start recording</p>
        </div>
      </div>
    );
  }

  if (busy) {
    return (
      <div className="fixed inset-0 z-50 bg-ink-950 flex flex-col items-center justify-center gap-4">
        <div className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        <p className="text-sm text-ink-400">Combining &amp; reprocessing…</p>
      </div>
    );
  }

  // Recording in progress
  return (
    <div
      className="fixed inset-0 z-50 bg-ink-950 flex flex-col"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
    >
      <div
        className="flex items-center justify-between px-5 pb-2 flex-shrink-0"
        style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}
      >
        <button onPointerDown={cancel} className="text-ink-400 text-sm py-2 pr-4">
          Cancel
        </button>
        <span className="text-sm font-semibold text-ink-100">Add to thought</span>
        <span className="text-sm font-mono text-ink-300">{formatTime(elapsed)}</span>
      </div>

      <div className="mx-5 mt-1 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 flex-shrink-0">
        <p className="text-[10px] uppercase tracking-wider text-accent mb-1">Appending to</p>
        <p className="text-sm text-ink-300 leading-snug line-clamp-2">"{title}"</p>
      </div>

      <div className="mx-5 mt-3 rounded-2xl bg-ink-900/70 border border-ink-700/40 p-4 flex-shrink-0">
        <WaveformVisualizer level={level} active={recording} height={80} />
        <div className="mt-2 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inset-0 rounded-full bg-accent opacity-60" />
            <span className="relative rounded-full h-2 w-2 bg-accent" />
          </span>
          <span className="text-xs text-ink-400">Recording — natural pauses are fine</span>
        </div>
      </div>

      <div className="mx-5 mt-3 flex-shrink-0">
        <p className="text-xs text-ink-500 text-center">
          New audio will be combined with the existing transcript and reprocessed.
        </p>
        {warn && <p className="text-xs text-amber-300/90 text-center mt-1">{warn}</p>}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col items-center gap-3 px-5 pb-6 flex-shrink-0">
        <button
          onPointerDown={stop}
          className="h-20 w-20 rounded-full bg-accent text-ink-950 shadow-[0_10px_40px_-5px_rgba(249,115,115,0.7)] active:scale-95 transition-transform flex items-center justify-center"
          aria-label="Stop recording"
        >
          <StopIcon />
        </button>
        <p className="text-[11px] text-ink-500">Tap to stop · combined &amp; reprocessed automatically</p>
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}
