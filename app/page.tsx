"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { registerSyncListeners, runFullSync } from "@/lib/sync";
import EntryCard from "@/components/EntryCard";
import Recorder from "@/components/Recorder";
import SyncIndicator from "@/components/SyncIndicator";
import SearchFilter from "@/components/SearchFilter";
import type { Category } from "@/lib/types";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");

  useEffect(() => {
    runFullSync().catch(() => {});
    const unsub = registerSyncListeners(() => {});
    return () => unsub();
  }, []);

  const entries = useLiveQuery(
    () => db().entries.orderBy("created_at").reverse().toArray(),
    []
  );

  const filtered = useMemo(() => {
    if (!entries) return [];
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (category !== "all" && e.processed?.category !== category) return false;
      if (!q) return true;
      const haystack = [
        e.processed?.title,
        e.processed?.cleaned_transcript,
        e.raw_transcript,
        ...(e.processed?.bullet_points ?? []),
        ...(e.processed?.ideas_and_research ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, query, category]);

  return (
    <main className="mx-auto max-w-xl px-4 pt-6 pb-32">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Muse</h1>
          <p className="text-xs text-ink-400 mt-0.5">Talk freely. Find it later.</p>
        </div>
        <div className="flex items-center gap-3">
          <SyncIndicator />
          <Link href="/settings" aria-label="Settings" className="text-ink-300 p-2 -mr-2">
            <GearIcon />
          </Link>
        </div>
      </header>

      <SearchFilter query={query} setQuery={setQuery} category={category} setCategory={setCategory} />

      <section className="mt-5 space-y-3">
        {entries === undefined && <div className="text-ink-500 text-sm">Loading…</div>}
        {entries && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-ink-700/50 p-6 text-center text-ink-400 text-sm">
            {entries.length === 0
              ? "No ideas yet. Tap the mic to capture your first thought."
              : "Nothing matches that filter."}
          </div>
        )}
        {filtered.map((e) => (
          <EntryCard key={e.id} entry={e} />
        ))}
      </section>

      <Recorder onSaved={() => { /* live query updates automatically */ }} />
    </main>
  );
}

function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
