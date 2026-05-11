"use client";

import { CATEGORIES, type Category } from "@/lib/types";

interface Props {
  query: string;
  setQuery: (s: string) => void;
  category: Category | "all";
  setCategory: (c: Category | "all") => void;
}

export default function SearchFilter({ query, setQuery, category, setCategory }: Props) {
  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search transcripts, titles, ideas…"
        className="w-full bg-ink-900 border border-ink-700/40 rounded-xl px-4 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      <div className="flex flex-wrap gap-2">
        <FilterPill active={category === "all"} onClick={() => setCategory("all")}>All</FilterPill>
        {CATEGORIES.map((c) => (
          <FilterPill key={c} active={category === c} onClick={() => setCategory(c)}>
            {c}
          </FilterPill>
        ))}
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs uppercase tracking-wider px-3 py-1.5 rounded-full border transition ${
        active
          ? "bg-accent text-ink-950 border-accent"
          : "bg-ink-900 text-ink-400 border-ink-700/40 hover:text-ink-200"
      }`}
    >
      {children}
    </button>
  );
}
