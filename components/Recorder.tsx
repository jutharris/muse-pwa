"use client";

import { useEffect, useRef, useState } from "react";
import { startRecorder, type RecorderHandle, isSpeechSupported, SILENCE_TIMEOUT_MS } from "@/lib/speech";
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
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [supported, setSupported] = useState(true);
  const handleRef = useRef<RecorderHandle | null>(null);
  const startedAt = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    setSupported(isSpeechSupported());
  }, []);

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
    setInterim("");
    setFinalText("");
    setOpen(true);
    try {
      const handle = await startRecorder({
        onInterim: (i, f) => {
          setInterim(i);
          setFinalText(f);
        },
        onLevel: setLevel,
        onError: (m) => setError(m),
        onAutoStopWarning: (msSince) => {
          const left = Math.max(0, Math.ceil((SILENCE_TIMEOUT_MS - msSince) / 1000));
          setWarn(`Stopping in ${left}s of silence — speak to keep going.`);
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
    if (!handleRef.current) return;
    setRecording(false);
    stopTimer();
    try {
      const result = await handleRef.current.stop();
      const speechTranscript = (result.transcript || finalText || "").trim();

      if (!result.audioBlob && !speechTranscript) {
        setError("Nothing was captured. Check mic permissions and try again.");
        setOpen(false);
        return;
      }

      // Save entry immediately so user sees it in the feed.
      const entry = await createEntry({
        raw_transcript: speechTranscript,
        audio_blob: result.audioBlob,
        audio_mime: result.audioMime,
        audio_duration_ms: result.durationMs,
      });
      setOpen(false);
      onSaved(entry.id);

      // Push raw entry to Supabase, then process via Claude.
      pushEntryNow(entry).catch(() => {});

      // If we have audio, always use Claude to transcribe + process for best results.
      // Falls back to text-only processing if no audio blob.
      (async () => {
        try {
          await updateEntry(entry.id, { processing_status: "processing" });
          let processed: Awaited<ReturnType<typeof processAudio>>;
          if (result.audioBlob && result.audioMime) {
            processed = await processAudio(result.audioBlob, result.audioMime);
          } else {
            processed = await processTranscript(speechTranscript);
          }
          // If Claude returned a raw_transcript (from audio path), use it.
          const finalTranscript = processed.raw_transcript || speechTranscript;
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
    } finally {
      handleRef.current = null;
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
      <button
        onClick={begin}
        aria-label="Record idea"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 h-20 w-20 rounded-full bg-accent text-ink-950 font-semibold shadow-[0_10px_30px_-5px_rgba(249,115,115,0.6)] active:scale-95 transition flex items-center justify-center"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
      >
        <MicIcon />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-ink-950/95 backdrop-blur-md flex flex-col">
          <header className="flex items-center justify-between p-4">
            <button onClick={cancel} className="text-ink-400 text-sm">Cancel</button>
            <div className="text-xs text-ink-400 tabular-nums">{formatTime(elapsed)}</div>
            <div className="w-12" />
          </header>

          <div className="flex-1 flex flex-col px-5 pb-6 overflow-hidden">
            {!supported && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200 mb-3 leading-relaxed">
                <strong>Safari / iOS:</strong> Live transcription isn't supported here. Your audio will still be recorded — you can type the transcript manually afterward to trigger Claude processing.
              </div>
            )}

            <div className="rounded-2xl bg-ink-900/70 border border-ink-700/40 p-4">
              <WaveformVisualizer level={level} active={recording} />
              <div className="mt-3 flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  {recording && <span className="animate-ping-slow absolute inset-0 rounded-full bg-accent opacity-70" />}
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${recording ? "bg-accent" : "bg-ink-500"}`} />
                </span>
                <span className="text-xs text-ink-400">
                  {recording ? "Listening — natural pauses are fine" : "Paused"}
                </span>
              </div>
            </div>

            <div className="flex-1 mt-4 overflow-y-auto rounded-2xl bg-ink-900/50 border border-ink-700/30 p-4 scrollbar-none">
              <p className="text-ink-100 text-base leading-relaxed whitespace-pre-wrap">
                {finalText}
                {interim && (
                  <span className="text-ink-400">{(finalText ? " " : "") + interim}</span>
                )}
                {!finalText && !interim && (
                  <span className="text-ink-500">Start talking — your words will appear here.</span>
                )}
              </p>
            </div>

            {warn && (
              <div className="mt-3 text-xs text-amber-300/90">{warn}</div>
            )}
            {error && (
              <div className="mt-3 text-xs text-red-300">{error}</div>
            )}

            <div className="mt-5 flex items-center justify-center">
              <button
                onClick={stop}
                disabled={!recording}
                className="h-16 w-16 rounded-full bg-accent text-ink-950 font-semibold shadow-[0_10px_30px_-5px_rgba(249,115,115,0.6)] active:scale-95 transition flex items-center justify-center disabled:opacity-40"
                aria-label="Stop recording"
              >
                <StopIcon />
              </button>
            </div>
            <p className="mt-3 text-center text-[11px] text-ink-500">
              Tap Stop when you're done. Auto-stops after 90s of true silence.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function MicIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
