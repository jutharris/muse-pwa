import type { Category } from "@/lib/types";

const COLORS: Record<Category, string> = {
  business: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  health: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  creative: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  newsletter: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  life: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  other: "bg-ink-700/50 text-ink-300 border-ink-600/40",
};

export default function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className={`inline-flex items-center text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${COLORS[category]}`}>
      {category}
    </span>
  );
}
