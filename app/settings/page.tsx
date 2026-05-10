"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSettings, saveSettings } from "@/lib/db";
import type { AppSettings } from "@/lib/types";

export default function SettingsPage() {
  const [form, setForm] = useState<Partial<AppSettings>>({});
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettings().then((s) => {
      setForm(s);
      setLoading(false);
    });
  }, []);

  const set = (patch: Partial<AppSettings>) => {
    setSaved(false);
    setForm((f) => ({ ...f, ...patch }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings(form as AppSettings);
    setSaved(true);
  };

  if (loading) return <main className="mx-auto max-w-xl px-4 pt-6 text-ink-400 text-sm">Loading…</main>;

  return (
    <main className="mx-auto max-w-xl px-4 pt-6 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-400 text-sm">← Back</Link>
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <Section title="Anthropic API" description="Used server-side for Claude processing. If you set ANTHROPIC_API_KEY in your deployment environment you can leave this blank.">
          <Field
            label="API Key"
            type="password"
            placeholder="sk-ant-…"
            value={form.anthropicApiKey ?? ""}
            onChange={(v) => set({ anthropicApiKey: v })}
            autoComplete="off"
          />
        </Section>

        <Section title="Supabase Sync" description="Optional. Connect Supabase to sync your ideas across devices. Entries sync automatically when online.">
          <Field
            label="Project URL"
            type="url"
            placeholder="https://xxxx.supabase.co"
            value={form.supabaseUrl ?? ""}
            onChange={(v) => set({ supabaseUrl: v })}
          />
          <Field
            label="Anon/Public Key"
            type="password"
            placeholder="ey…"
            value={form.supabaseAnonKey ?? ""}
            onChange={(v) => set({ supabaseAnonKey: v })}
            autoComplete="off"
          />
          <label className="flex items-center gap-3 cursor-pointer mt-2">
            <input
              type="checkbox"
              checked={form.syncEnabled ?? true}
              onChange={(e) => set({ syncEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-ink-600 bg-ink-800 accent-accent"
            />
            <span className="text-sm text-ink-200">Enable cloud sync</span>
          </label>
        </Section>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="bg-accent text-ink-950 font-semibold text-sm px-6 py-2.5 rounded-xl active:scale-95 transition"
          >
            Save settings
          </button>
          {saved && <span className="text-emerald-400 text-sm">Saved ✓</span>}
        </div>
      </form>

      <div className="mt-8 rounded-xl bg-ink-900/50 border border-ink-700/30 p-4">
        <p className="text-xs text-ink-400">
          <strong className="text-ink-300">Device ID:</strong> {form.deviceId ?? "—"}
        </p>
        <p className="mt-1 text-xs text-ink-500">
          All data is stored locally on this device first. Cloud sync is opt-in and uses your own Supabase project.
        </p>
      </div>
    </main>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-ink-900/70 border border-ink-700/40 p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ink-100">{title}</h2>
        <p className="text-xs text-ink-400 mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Field({
  label, type = "text", placeholder, value, onChange, autoComplete,
}: {
  label: string; type?: string; placeholder?: string; value: string;
  onChange: (v: string) => void; autoComplete?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-ink-300 uppercase tracking-wider">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full bg-ink-800 border border-ink-700/60 rounded-xl px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
    </label>
  );
}
