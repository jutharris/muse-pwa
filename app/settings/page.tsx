"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSettings, db } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";

export default function SettingsPage() {
  const [deviceId, setDeviceId] = useState("—");
  const [supabaseConfigured, setSupabaseConfigured] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setDeviceId(s.deviceId);
    });
    setSupabaseConfigured(
      !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    );
  }, []);

  const counts = useLiveQuery(async () => {
    const all = await db().entries.toArray();
    return {
      total: all.length,
      synced: all.filter((e) => e.sync_status === "synced").length,
      pending: all.filter((e) => e.sync_status === "pending").length,
      failed: all.filter((e) => e.sync_status === "failed").length,
    };
  }, []);

  return (
    <main className="mx-auto max-w-xl px-4 pt-6 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-400 text-sm">← Back</Link>
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl bg-ink-900/70 border border-ink-700/40 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-ink-100">Cloud Sync</h2>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${supabaseConfigured ? "bg-emerald-400" : "bg-amber-400"}`} />
            <span className="text-sm text-ink-300">
              {supabaseConfigured ? "Supabase connected via environment" : "Supabase not configured"}
            </span>
          </div>
          {counts && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              <Stat label="Total" value={counts.total} />
              <Stat label="Synced" value={counts.synced} color="text-emerald-400" />
              <Stat label="Pending" value={counts.pending} color="text-amber-400" />
            </div>
          )}
          {counts && counts.failed > 0 && (
            <p className="text-xs text-red-400">{counts.failed} entries failed to sync</p>
          )}
        </div>

        <div className="rounded-2xl bg-ink-900/70 border border-ink-700/40 p-4">
          <h2 className="text-sm font-semibold text-ink-100 mb-2">About</h2>
          <p className="text-xs text-ink-400">
            <span className="text-ink-300">Device ID: </span>{deviceId}
          </p>
          <p className="mt-2 text-xs text-ink-500">
            All API keys are configured server-side via environment variables. Data is stored locally in IndexedDB and synced to Supabase automatically when online.
          </p>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, color = "text-ink-100" }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl bg-ink-800/60 p-3 text-center">
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-[10px] text-ink-400 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}
