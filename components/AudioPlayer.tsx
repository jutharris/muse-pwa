"use client";

import { useEffect, useRef, useState } from "react";

export default function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onLoaded = () => setDuration(isFinite(a.duration) ? a.duration : 0);
    const onEnded = () => { setPlaying(false); setCurrent(0); };
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("durationchange", onLoaded);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("durationchange", onLoaded);
      a.removeEventListener("ended", onEnded);
      cancelAnimationFrame(rafRef.current);
    };
  }, [src]);

  const tick = () => {
    const a = audioRef.current;
    if (!a) return;
    setCurrent(a.currentTime);
    if (!a.paused) rafRef.current = requestAnimationFrame(tick);
  };

  const togglePlay = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      await a.play();
      setPlaying(true);
      rafRef.current = requestAnimationFrame(tick);
    } else {
      a.pause();
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
    }
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const t = Number(e.target.value);
    a.currentTime = t;
    setCurrent(t);
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl bg-ink-900/70 border border-ink-700/40 px-4 py-3">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        onClick={togglePlay}
        className="h-9 w-9 rounded-full bg-accent text-ink-950 flex items-center justify-center flex-shrink-0 active:scale-95 transition"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="text-xs text-ink-400 tabular-nums w-8 flex-shrink-0">{fmt(current)}</span>
      <input
        type="range"
        min={0}
        max={duration || 100}
        step={0.1}
        value={current}
        onChange={seek}
        className="flex-1 accent-accent h-1 cursor-pointer"
      />
      <span className="text-xs text-ink-400 tabular-nums w-8 flex-shrink-0 text-right">{fmt(duration)}</span>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}
