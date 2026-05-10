"use client";

// Wrapper around the Web Speech API + MediaRecorder.
// Handles: continuous recognition, auto-restart on onend, true-silence
// timeout (90s), interim results, and parallel raw audio capture.

type RecognitionEvent = {
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
  resultIndex: number;
};

type SR = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SR;
    webkitSpeechRecognition?: new () => SR;
  }
}

export interface RecorderHandle {
  stop: () => Promise<RecorderResult>;
  cancel: () => void;
  isSupported: boolean;
}

export interface RecorderResult {
  transcript: string;          // final transcript
  audioBlob?: Blob;
  audioMime?: string;
  durationMs: number;
  endedReason: "user" | "silence" | "error";
}

export interface RecorderCallbacks {
  onInterim?: (interim: string, finalSoFar: string) => void;
  onLevel?: (level: number) => void;          // 0..1 RMS
  onError?: (msg: string) => void;
  onAutoStopWarning?: (msSinceLastSpeech: number) => void;
}

export const SILENCE_TIMEOUT_MS = 90_000;
const LEVEL_THRESHOLD = 0.012;   // RMS below this counts as "silence"

export function isSpeechSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export async function startRecorder(cb: RecorderCallbacks = {}): Promise<RecorderHandle> {
  const SRCtor = (window.SpeechRecognition || window.webkitSpeechRecognition) as
    | (new () => SR)
    | undefined;

  // Audio capture (mic stream) — used both by analyser and MediaRecorder.
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    cb.onError?.(`Mic permission denied: ${(err as Error).message}`);
    throw err;
  }

  // ----- MediaRecorder -----
  const mime = pickMime();
  const mediaRecorder = mime
    ? new MediaRecorder(stream, { mimeType: mime })
    : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  mediaRecorder.start(1000);

  const startedAt = Date.now();

  // ----- Audio analyser for waveform + silence -----
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);

  let lastSpeechAt = Date.now();
  let stopped = false;
  let endedReason: RecorderResult["endedReason"] = "user";
  let raf = 0;

  const tick = () => {
    if (stopped) return;
    analyser.getByteTimeDomainData(buf);
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / buf.length);
    cb.onLevel?.(Math.min(1, rms * 4));
    if (rms > LEVEL_THRESHOLD) {
      lastSpeechAt = Date.now();
    } else {
      const since = Date.now() - lastSpeechAt;
      if (since >= SILENCE_TIMEOUT_MS) {
        endedReason = "silence";
        // Trigger stop via the handle path
        finalize().catch(() => {});
        return;
      } else if (since > SILENCE_TIMEOUT_MS - 10_000) {
        cb.onAutoStopWarning?.(since);
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  // ----- Web Speech recognition -----
  let recognition: SR | null = null;
  let finalTranscript = "";
  let userStopped = false;

  if (SRCtor) {
    recognition = new SRCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";

    recognition.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript;
        if (r.isFinal) {
          finalTranscript += (finalTranscript && !finalTranscript.endsWith(" ") ? " " : "") + text.trim();
        } else {
          interim += text;
        }
      }
      cb.onInterim?.(interim, finalTranscript);
      // Speech is happening — reset silence timer too
      lastSpeechAt = Date.now();
    };

    recognition.onerror = (e) => {
      // 'no-speech' / 'audio-capture' commonly fire during long pauses; let
      // onend handle restart. Surface only fatal cases.
      const code = e.error || "unknown";
      if (code === "not-allowed" || code === "service-not-allowed") {
        cb.onError?.("Speech recognition permission denied.");
      }
    };

    recognition.onend = () => {
      // Auto-restart unless the user explicitly stopped or silence triggered finalize.
      if (!userStopped && !stopped) {
        try { recognition?.start(); } catch { /* race; ignore */ }
      }
    };

    try { recognition.start(); } catch (err) {
      cb.onError?.(`Could not start recognition: ${(err as Error).message}`);
    }
  } else {
    cb.onError?.("Web Speech API is not available in this browser. Audio is still being recorded.");
  }

  const cleanup = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    try { source.disconnect(); } catch {}
    try { analyser.disconnect(); } catch {}
    try { audioCtx.close(); } catch {}
    if (stream) stream.getTracks().forEach((t) => t.stop());
  };

  const finalize = async (): Promise<RecorderResult> => {
    if (stopped) {
      return {
        transcript: finalTranscript.trim(),
        durationMs: Date.now() - startedAt,
        endedReason,
      };
    }
    userStopped = true;
    if (recognition) {
      try { recognition.stop(); } catch {}
    }
    // Wait for MediaRecorder to flush.
    const audioBlob = await new Promise<Blob | undefined>((resolve) => {
      if (mediaRecorder.state === "inactive") {
        resolve(chunks.length ? new Blob(chunks, { type: mime || "audio/webm" }) : undefined);
        return;
      }
      mediaRecorder.onstop = () => {
        resolve(chunks.length ? new Blob(chunks, { type: mime || "audio/webm" }) : undefined);
      };
      try { mediaRecorder.stop(); } catch { resolve(undefined); }
    });
    cleanup();
    return {
      transcript: finalTranscript.trim(),
      audioBlob,
      audioMime: audioBlob?.type,
      durationMs: Date.now() - startedAt,
      endedReason,
    };
  };

  const cancel = () => {
    userStopped = true;
    try { recognition?.abort(); } catch {}
    try { mediaRecorder.stop(); } catch {}
    cleanup();
  };

  return {
    stop: finalize,
    cancel,
    isSupported: !!SRCtor,
  };
}

function pickMime(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const c of candidates) {
    // @ts-ignore – isTypeSupported exists at runtime
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return undefined;
}
