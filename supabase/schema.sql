-- Muse PWA — Supabase schema
-- Run this in your Supabase SQL Editor before enabling sync.

create table if not exists public.entries (
  id                uuid primary key,
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  raw_transcript    text not null default '',
  raw_audio_path    text,                     -- future: Supabase Storage path
  processed         jsonb,                    -- ProcessedEntry JSON
  processing_status text not null default 'unprocessed'
                    check (processing_status in ('unprocessed','processing','processed','process_failed')),
  device_id         text not null default ''
);

-- Index for feed ordering
create index if not exists entries_created_at_idx on public.entries (created_at desc);

-- Index for device filtering
create index if not exists entries_device_idx on public.entries (device_id);

-- ─── Row Level Security ────────────────────────────────────────────────────────
-- This is a personal single-user app. The simplest approach: enable RLS and
-- lock the table to the anon key so only your deploy can read/write.
-- For stronger security: use Supabase auth and restrict to your user ID.

alter table public.entries enable row level security;

-- Allow all operations from the anon key (your deploy uses the anon key).
-- Tighten this policy if you want multi-user auth later.
create policy "anon full access" on public.entries
  for all
  using (true)
  with check (true);
