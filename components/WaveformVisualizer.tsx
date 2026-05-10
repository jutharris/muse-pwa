"use client";

import { useEffect, useRef } from "react";

interface Props {
  level: number;          // 0..1 instantaneous RMS
  active: boolean;
  height?: number;
  bars?: number;
}

export default function WaveformVisualizer({ level, active, height = 120, bars = 48 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>(Array(bars).fill(0));
  const rafRef = useRef<number>(0);
  const lastLevel = useRef(level);

  useEffect(() => {
    lastLevel.current = level;
  }, [level]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // shift history
      historyRef.current.shift();
      historyRef.current.push(active ? lastLevel.current : 0);

      const barW = w / bars;
      const cx = w / 2;
      const cy = h / 2;
      for (let i = 0; i < bars; i++) {
        const v = historyRef.current[i];
        const bh = Math.max(2 * dpr, v * h * 0.95);
        const x = i * barW;
        const grad = ctx.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2);
        grad.addColorStop(0, "rgba(255,142,142,0.95)");
        grad.addColorStop(1, "rgba(249,115,115,0.6)");
        ctx.fillStyle = active ? grad : "rgba(107,114,128,0.45)";
        roundRect(ctx, x + barW * 0.18, cy - bh / 2, barW * 0.64, bh, 2 * dpr);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [active, bars]);

  return (
    <canvas
      ref={canvasRef}
      style={{ height, width: "100%" }}
      className="w-full"
      aria-hidden
    />
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
