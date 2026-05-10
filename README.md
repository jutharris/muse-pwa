# Muse — Voice-First Idea Capture PWA

An offline-first Progressive Web App for capturing, storing, and AI-processing
spoken ideas. Built with Next.js, Tailwind, IndexedDB (Dexie), and Claude.

---

## Features

- **Voice recording** — continuous Web Speech API + MediaRecorder, auto-restart on pause, 90-second true-silence auto-stop
- **Live waveform + interim transcript** while recording
- **Offline-first** — all data lives in IndexedDB; the app works fully without internet
- **AI processing** — Claude cleans transcripts, extracts bullet points, follow-up ideas, category, and title
- **Cloud sync** — optional Supabase Postgres backup, auto-syncs when online
- **PWA** — installable on iOS and Android home screens, service worker via Workbox
- **Dark mode** by default, mobile-first layout

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS |
| Local DB | Dexie.js (IndexedDB) |
| Service Worker | next-pwa (Workbox) |
| AI | Anthropic Claude (`claude-sonnet-4-20250514`) |
| Cloud Sync | Supabase (Postgres) |
| Hosting | Vercel or Railway |

---

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/jutharris/muse-pwa.git
cd muse-pwa
npm install
```

### 2. Set environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Required for AI processing (server-side)
ANTHROPIC_API_KEY=sk-ant-...

# Optional: cloud sync (can also be entered in the in-app Settings page)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ey...
```

### 3. Set up Supabase (optional)

1. Create a project at [supabase.com](https://supabase.com)
2. In the SQL Editor, run the contents of `supabase/schema.sql`
3. Add your project URL and anon key to `.env.local` (or enter them in Settings after install)

### 4. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`. The PWA service worker is disabled in dev mode — run `npm run build && npm start` to test the full offline experience.

---

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Import the repo in Vercel
2. Add environment variables in the Vercel dashboard
3. Deploy — `vercel.json` is pre-configured

---

## Deploy to Railway

1. Create a new project in [Railway](https://railway.app)
2. Connect the repo
3. Add environment variables in the Railway dashboard
4. Deploy — `railway.toml` is pre-configured

---

## PWA Install on iPhone

1. Open the deployed URL in **Safari**
2. Tap the Share icon → **Add to Home Screen**
3. The app installs and runs fully offline

> **Note:** Web Speech API live transcription is not available in Safari/iOS (Webkit restriction). The audio is still recorded via MediaRecorder and stored locally. You can process it via the Retry button once online, or use Chrome on desktop for full live-transcript support.

---

## Data Model

Each entry stored in IndexedDB (and optionally Supabase):

```ts
{
  id: string,                    // UUID
  created_at: number,            // ms epoch
  updated_at: number,
  raw_transcript: string,        // speech-to-text output
  raw_audio_blob?: Blob,         // local only (IndexedDB)
  raw_audio_mime?: string,
  raw_audio_duration_ms?: number,
  processed?: {
    cleaned_transcript: string,
    bullet_points: string[],
    ideas_and_research: string[],
    category: "business"|"health"|"creative"|"newsletter"|"life"|"other",
    title: string,               // ≤5 words
  },
  processing_status: "unprocessed"|"processing"|"processed"|"process_failed",
  sync_status: "pending"|"synced"|"failed",
}
```

---

## Architecture

```
Browser
  ├── IndexedDB (Dexie)      ← primary store, always written first
  ├── Web Speech API         ← live transcript, auto-restarted
  ├── MediaRecorder          ← raw audio blob
  ├── AudioContext analyser  ← waveform + silence detection
  └── Service Worker         ← offline shell + background sync

Server (Next.js API route)
  └── /api/process           ← proxies transcript to Claude API
                               (keeps API key server-side)

Cloud (optional)
  └── Supabase Postgres      ← receives synced entries (no audio)
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (server) | Claude API key |
| `ANTHROPIC_MODEL` | No | Override model (default: `claude-sonnet-4-20250514`) |
| `NEXT_PUBLIC_SUPABASE_URL` | No | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Supabase anon key |
| `NEXT_PUBLIC_DEVICE_ID` | No | Fixed device ID (auto-generated if unset) |

All Supabase credentials can also be entered via the in-app **Settings** page — they're stored in IndexedDB and take precedence over env vars.
