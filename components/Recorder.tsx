"use client";

import { useRef, useState } from "react";
import { startRecorder, type RecorderHandle, SILENCE_TIMEOUT_MS } from "@/lib/speech";
import { createEntry, updateEntry } from "@/lib/db";
import { pushEntryNow } from "@/lib/sync";
import { processAudio, processTranscript } from "@/lib/claude";
import WaveformVisualizer from "./WaveformVisualizer";

interface Props {
  onSaved: (entryId: string) => void;
}

export default function Recorder({ onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
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
    setOpen(true);
    try {
      // Pass no speech callbacks — we use Claude for transcription on all browsers.
      // onLevel drives the waveform only.
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
      setRecording(false);
      setOpen(false);
    }
  };

  const stop = async () => {
    if (!handleRef.current || !recording) return;
    setRecording(false);
    stopTimer();
    const handle = handleRef.current;
    handleRef.current = null;

    try {
      const result = await handle.stop();

      if (!result.audioBlob) {
        setError("Nothing captured — check mic permissions and try again.");
        setOpen(false);
        return;
      }

      const entry = await createEntry({
        raw_transcript: "",
        audio_blob: result.audioBlob,
        audio_mime: result.audioMime,
        audio_duration_ms: result.durationMs,
      });
      setOpen(false);
      onSaved(entry.id);
      pushEntryNow(entry).catch(() => {});

      (async () => {
        try {
          await updateEntry(entry.id, { processing_status: "processing" });
          const processed = await processAudio(result.audioBlob!, result.audioMime || "audio/webm");
          const finalTranscript = processed.raw_transcript || "";
          await updateEntry(entry.id, {
            raw_transcript: finalTranscript,
            processed,
            processing_status: "processed",
            processing_error: undefined,
            sync_status: "pending",
          });
          pushEntryNow({ ...entry, raw_transcript: finalTranscript, processed, processing_status: "processed", sync_status: "pending" }).catch(() => {});
        } catch (err) {
          await updateEntry(entry.id, {
            processing_status: "process_failed",
            processing_error: (err as Error).message,
          });
        }
      })();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const cancel = () => {
    handleRef.current?.cancel();
    handleRef.current = null;
    stopTimer();
    setRecording(false);
    setOpen(false);
  };

  return (
    <>
      {/* Floating mic button */}
      <button
        onClick={begin}
        aria-label="Record idea"
        className="fixed left-1/2 -translate-x-1/2 z-30 h-20 w-20 rounded-full bg-accent text-ink-950 shadow-[0_10px_30px_-5px_rgba(249,115,115,0.6)] active:scale-95 transition-transform flex items-center justify-center"
        style={{ bottom: "calc(max(env(safe-area-inset-bottom), 16px) + 16px)" }}
      >
        <MicIcon />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-ink-950 flex flex-col" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0"
               style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}>
            <button
              onPointerDown={cancel}
              className="text-ink-400 text-sm py-2 pr-4"
            >
              Cancel
            </button>
            <span className="text-sm font-mono text-ink-300">{formatTime(elapsed)}</span>
            <div className="w-16" />
          </div>

          {/* Waveform */}
          <div className="mx-5 rounded-2xl bg-ink-900/70 border border-ink-700/40 p-4 flex-shrink-0">
            <WaveformVisualizer level={level} active={recording} height={80} />
            <div className="mt-2 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                {recording && <span className="animate-ping absolute inset-0 rounded-full bg-accent opacity-60" />}
                <span className={`relative rounded-full h-2 w-2 ${recording ? "bg-accent" : "bg-ink-600"}`} />
              </span>
              <span className="text-xs text-ink-400">
                {recording ? "Recording — natural pauses are fine" : "Starting…"}
              </span>
            </div>
          </div>

          {/* Status messages */}
          <div className="mx-5 mt-3 flex-shrink-0 space-y-2">
            <p className="text-xs text-ink-500 text-center">
              Claude will transcribe and process your recording when you stop.
            </p>
            {warn && <p className="text-xs text-amber-300/90 text-center">{warn}</p>}
            {error && <p className="text-xs text-red-300 text-center">{error}</p>}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Stop button — large tap target, well above home indicator */}
          <div className="flex flex-col items-center gap-3 px-5 pb-6 flex-shrink-0">
            <button
              onPointerDown={stop}
              className="h-20 w-20 rounded-full bg-accent text-ink-950 shadow-[0_10px_40px_-5px_rgba(249,115,115,0.7)] active:scale-95 transition-transform flex items-center justify-center"
              aria-label="Stop recording"
            >
              <StopIcon />
            </button>
            <p className="text-[11px] text-ink-500">Tap to stop · auto-stops after 90s silence</p>
          </div>
        </div>
      )}
    </>
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
