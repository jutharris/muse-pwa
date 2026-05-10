"use client";

import Link from "next/link";
import type { Entry } from "@/lib/types";
import CategoryBadge from "./CategoryBadge";

export default function EntryCard({ entry }: { entry: Entry }) {
  const title = entry.processed?.title || (entry.processing_status === "processing" ? "Processing…" : "Untitled");
  const bullets = entry.processed?.bullet_points?.slice(0, 3) ?? [];
  const date = new Date(entry.created_at);
  return (
    <Link
      href={`/entry/${entry.id}`}
      className="block rounded-2xl bg-ink-900/70 border border-ink-700/40 p-4 active:scale-[0.99] transition"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-ink-100 leading-tight">{title}</h3>
        {entry.processed?.category && <CategoryBadge category={entry.processed.category} />}
      </div>
      <div className="mt-1 text-[11px] text-ink-400 flex items-center gap-2">
        <span>{formatDate(date)}</span>
        <StatusDot entry={entry} />
      </div>
      {bullets.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="text-sm text-ink-300 leading-snug flex gap-2">
              <span className="text-accent mt-1.5 inline-block h-1 w-1 rounded-full flex-shrink-0" />
              <span className="line-clamp-2">{b}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-400 line-clamp-2">
          {entry.raw_transcript || (entry.processing_status === "processing" ? "Processing your idea…" : "No transcript yet.")}
        </p>
      )}
    </Link>
  );
}

function StatusDot({ entry }: { entry: Entry }) {
  const labels: string[] = [];
  if (entry.processing_status === "processing") labels.push("processing");
  else if (entry.processing_status === "unprocessed") labels.push("unprocessed");
  else if (entry.processing_status === "process_failed") labels.push("process failed");

  if (entry.sync_status === "pending") labels.push("sync pending");
  else if (entry.sync_status === "failed") labels.push("sync failed");

  if (labels.length === 0) return null;
  const tone =
    entry.processing_status === "process_failed" || entry.sync_status === "failed"
      ? "bg-red-400"
      : "bg-amber-400";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone}`} />
      <span>{labels.join(" · ")}</span>
    </span>
  );
}

function formatDate(d: Date): string {
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" }) +
        " · " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
