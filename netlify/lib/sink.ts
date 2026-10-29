import { fetchJson } from './http-client.ts';
import { configError } from './errors.ts';
import { optionalEnv } from './env.ts';
import type { Logger } from './logger.ts';
import type { ProcessedFeedback } from './types.ts';

export interface PersistResult {
  target: 'supabase' | 'none';
  persisted: number;
}

export function isPersistenceConfigured(): boolean {
  return Boolean(optionalEnv('SUPABASE_URL') && optionalEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

function toRow(item: ProcessedFeedback, organizationId: string): Record<string, unknown> {
  return {
    organization_id: organizationId,
    dedupe_key: item.dedupeKey,
    source: item.source,
    channel: item.channel,
    external_id: item.externalId,
    author_name: item.author.name,
    author_handle: item.author.handle ?? null,
    author_email: item.author.email ?? null,
    subject: item.subject ?? null,
    text: item.text,
    rating: item.rating ?? null,
    url: item.url ?? null,
    language: item.language ?? null,
    created_at: item.createdAt,
    received_at: item.receivedAt,
    sentiment_label: item.analysis.sentiment.label,
    sentiment_score: item.analysis.sentiment.score,
    category: item.analysis.category,
    topics: item.analysis.topics,
    urgency_score: item.analysis.urgency.score,
    urgency_level: item.analysis.urgency.level,
    urgency_reasons: item.analysis.urgency.reasons,
    confidence: item.analysis.confidence,
    summary: item.analysis.summary,
    analysis_model: item.analysis.model,
    metadata: item.metadata,
  };
}

/**
 * Idempotent tenant-scoped upsert into Supabase. A configured organization is
 * mandatory whenever persistence is enabled; records never silently fall into
 * a shared "default" tenant.
 */
export async function persistFeedback(
  items: readonly ProcessedFeedback[],
  ctx: { log: Logger; deadlineAt: number; organizationId?: string; fetchImpl?: typeof fetch },
): Promise<PersistResult> {
  const url = optionalEnv('SUPABASE_URL');
  const key = optionalEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key || items.length === 0) return { target: 'none', persisted: 0 };

  const organizationId = ctx.organizationId?.trim() || optionalEnv('DEFAULT_ORGANIZATION_ID');
  if (!organizationId) throw configError('DEFAULT_ORGANIZATION_ID');
  if (organizationId === 'default') {
    throw configError('DEFAULT_ORGANIZATION_ID (must be a real organization ID)');
  }

  const table = optionalEnv('SUPABASE_FEEDBACK_TABLE') ?? 'feedback';
  const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/${encodeURIComponent(table)}?on_conflict=organization_id,dedupe_key`;
  let persisted = 0;

  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    await fetchJson({
      upstream: 'Supabase',
      url: endpoint,
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: chunk.map((item) => toRow(item, organizationId)),
      deadlineAt: ctx.deadlineAt,
      log: ctx.log,
      ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}),
    });
    persisted += chunk.length;
  }
  ctx.log.info('persist.completed', { target: 'supabase', table, organizationId, persisted });
  return { target: 'supabase', persisted };
}
