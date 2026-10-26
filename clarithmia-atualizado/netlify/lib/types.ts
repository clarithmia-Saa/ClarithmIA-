export type FeedbackSource = string;
export type Sentiment = 'positive' | 'neutral' | 'negative';
export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export interface FeedbackAuthor {
  id?: string;
  name: string;
  handle?: string;
  email?: string;
}

/** Canonical feedback shape shared by every connector and by the webhook. */
export interface NormalizedFeedback {
  /** Stable, human-readable id: `<source>:<externalId>`. */
  id: string;
  /** SHA-256 of `<source>:<externalId>`. Used for idempotent upserts. */
  dedupeKey: string;
  source: FeedbackSource;
  channel: string;
  externalId: string;
  author: FeedbackAuthor;
  subject?: string;
  text: string;
  /** Normalized to the 1..5 scale when the origin provides a rating. */
  rating?: number;
  url?: string;
  language?: string;
  createdAt: string;
  receivedAt: string;
  metadata: Record<string, unknown>;
}

export interface AiAnalysis {
  model: string;
  sentiment: { label: Sentiment; score: number };
  category: string;
  topics: string[];
  urgency: {
    /** 0..100 */
    score: number;
    level: UrgencyLevel;
    /** Compatible with the ClarithmIA inbox filter (`high | medium | low`). */
    inboxLevel: 'high' | 'medium' | 'low';
    reasons: string[];
  };
  confidence: number;
  summary: string;
  processedAt: string;
  processingMs: number;
}

export interface ProcessedFeedback extends NormalizedFeedback {
  analysis: AiAnalysis;
}

export interface SyncCounts {
  fetched: number;
  normalized: number;
  analyzed: number;
  persisted: number;
  skipped: number;
}

export interface SyncReport {
  runId: string;
  connector: string;
  status: 'success' | 'partial' | 'failed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  counts: SyncCounts;
  skipped: Record<string, number>;
  hasMore: boolean;
  cursor?: Record<string, string | null>;
  rateLimit?: { limit?: number; remaining?: number; resetAt?: string };
  warnings: string[];
  errors: { code: string; message: string }[];
}
