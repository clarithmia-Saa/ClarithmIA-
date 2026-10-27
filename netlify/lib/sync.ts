import type { Logger } from './logger.ts';
import type { SyncCounts, SyncReport } from './types.ts';

export interface SyncTracker {
  runId: string;
  counts: SyncCounts;
  skip(reason: string): void;
  warn(message: string): void;
  error(code: string, message: string): void;
  finish(extra?: { hasMore?: boolean; cursor?: Record<string, string | null>; rateLimit?: SyncReport['rateLimit'] }): SyncReport;
}

/**
 * Tracks one synchronization run and emits structured `sync.started`,
 * `sync.warning` and `sync.completed` / `sync.failed` log events.
 */
export function startSync(connector: string, log: Logger, meta: Record<string, unknown> = {}): SyncTracker {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const runId = crypto.randomUUID();
  const counts: SyncCounts = { fetched: 0, normalized: 0, analyzed: 0, persisted: 0, skipped: 0 };
  const skipped: Record<string, number> = {};
  const warnings: string[] = [];
  const errors: { code: string; message: string }[] = [];
  const syncLog = log.child({ connector, runId });

  syncLog.info('sync.started', meta);

  return {
    runId,
    counts,
    skip(reason) {
      counts.skipped += 1;
      skipped[reason] = (skipped[reason] ?? 0) + 1;
    },
    warn(message) {
      warnings.push(message);
      syncLog.warn('sync.warning', { message });
    },
    error(code, message) {
      errors.push({ code, message });
      syncLog.error('sync.error', { code, message });
    },
    finish(extra = {}) {
      const finished = Date.now();
      const status: SyncReport['status'] =
        errors.length > 0 && counts.normalized === 0 ? 'failed' : errors.length > 0 || warnings.length > 0 ? 'partial' : 'success';
      const report: SyncReport = {
        runId,
        connector,
        status,
        startedAt,
        finishedAt: new Date(finished).toISOString(),
        durationMs: finished - started,
        counts: { ...counts },
        skipped: { ...skipped },
        hasMore: extra.hasMore ?? false,
        ...(extra.cursor ? { cursor: extra.cursor } : {}),
        ...(extra.rateLimit ? { rateLimit: extra.rateLimit } : {}),
        warnings: [...warnings],
        errors: [...errors],
      };
      syncLog[status === 'failed' ? 'error' : 'info'](status === 'failed' ? 'sync.failed' : 'sync.completed', {
        status,
        durationMs: report.durationMs,
        counts: report.counts,
        skipped: report.skipped,
        hasMore: report.hasMore,
        ...(report.cursor ? { cursor: report.cursor } : {}),
        ...(report.rateLimit ? { rateLimit: report.rateLimit } : {}),
        warnings: report.warnings.length,
        errors: report.errors.length,
      });
      return report;
    },
  };
}
