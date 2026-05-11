export type Category = "business" | "health" | "creative" | "newsletter" | "life" | "other";

export const CATEGORIES: Category[] = ["business", "health", "creative", "newsletter", "life", "other"];

export type SyncStatus = "pending" | "synced" | "failed";

export interface ProcessedEntry {
  cleaned_transcript: string;
  bullet_points: string[];
  ideas_and_research: string[];
  category: Category;
  title: string;
}

export interface Entry {
  id: string;
  created_at: number;            // ms epoch
  raw_transcript: string;
  raw_audio_blob?: Blob;         // stored as a blob in IDB
  raw_audio_mime?: string;
  raw_audio_duration_ms?: number;
  processed?: ProcessedEntry;
  processing_status: "unprocessed" | "processing" | "processed" | "process_failed";
  processing_error?: string;
  sync_status: SyncStatus;
  sync_error?: string;
  updated_at: number;
  hidden?: boolean;
}

export interface AppSettings {
  id: "singleton";
  deviceId: string;
}
