import { requireSourcesAuth } from '../lib/auth.ts';
import { optionalEnv } from '../lib/env.ts';
import { badRequest, toAppError } from '../lib/errors.ts';
import { createHandler } from '../lib/http.ts';
import { fetchJson } from '../lib/http-client.ts';
import { isPersistenceConfigured } from '../lib/sink.ts';

export const config = { path: '/api/sources' };

export const VALID_PLATFORMS = [
  'instagram',
  'tiktok',
  'x',
  'youtube',
  'support',
  'appstore',
  'playstore',
  'facebook',
  'linkedin',
  'webhook',
] as const;

export type ValidPlatform = (typeof VALID_PLATFORMS)[number];

export const VALID_STATUSES = ['operational', 'syncing', 'disconnected', 'error'] as const;
export type ValidStatus = (typeof VALID_STATUSES)[number];

const SENSITIVE_KEY_PATTERN = /(?:secret|password|token|key|private|cert|cred|auth)/i;

/** Sanitizes metadata, stripping any secret or credential fields to protect against accidental leaks. */
export function sanitizeConfigMetadata(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue; // strictly reject credentials
    if (typeof value === 'string') {
      cleaned[key] = value.slice(0, 500);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      cleaned[key] = value;
    } else if (value === null) {
      cleaned[key] = null;
    }
  }
  return cleaned;
}

export interface SourceRowDto {
  id: string;
  platform: ValidPlatform;
  status: ValidStatus;
  connected: boolean;
  displayName: string;
  feedbacksCount: number;
  lastSyncAt: string | null;
  configMetadata: Record<string, unknown>;
  organizationId: string;
}

const DEFAULT_CATALOG: readonly Omit<SourceRowDto, 'id' | 'organizationId'>[] = [
  { platform: 'instagram', status: 'operational', connected: true, displayName: 'Instagram', feedbacksCount: 4823, lastSyncAt: new Date(Date.now() - 120_000).toISOString(), configMetadata: {} },
  { platform: 'tiktok', status: 'syncing', connected: true, displayName: 'TikTok', feedbacksCount: 2194, lastSyncAt: new Date().toISOString(), configMetadata: {} },
  { platform: 'x', status: 'operational', connected: true, displayName: 'X', feedbacksCount: 3605, lastSyncAt: new Date(Date.now() - 300_000).toISOString(), configMetadata: {} },
  { platform: 'youtube', status: 'operational', connected: true, displayName: 'YouTube', feedbacksCount: 1472, lastSyncAt: new Date(Date.now() - 720_000).toISOString(), configMetadata: {} },
  { platform: 'support', status: 'operational', connected: true, displayName: 'Support', feedbacksCount: 2220, lastSyncAt: new Date(Date.now() - 60_000).toISOString(), configMetadata: {} },
  { platform: 'appstore', status: 'disconnected', connected: false, displayName: 'App Store', feedbacksCount: 0, lastSyncAt: null, configMetadata: {} },
  { platform: 'playstore', status: 'disconnected', connected: false, displayName: 'Google Play', feedbacksCount: 0, lastSyncAt: null, configMetadata: {} },
  { platform: 'facebook', status: 'disconnected', connected: false, displayName: 'Facebook', feedbacksCount: 0, lastSyncAt: null, configMetadata: {} },
  { platform: 'linkedin', status: 'disconnected', connected: false, displayName: 'LinkedIn', feedbacksCount: 0, lastSyncAt: null, configMetadata: {} },
  { platform: 'webhook', status: 'disconnected', connected: false, displayName: 'Webhook de Entrada', feedbacksCount: 0, lastSyncAt: null, configMetadata: {} },
];

function isAllowedPlatform(val: unknown): val is ValidPlatform {
  return typeof val === 'string' && (VALID_PLATFORMS as readonly string[]).includes(val);
}

function isAllowedStatus(val: unknown): val is ValidStatus {
  return typeof val === 'string' && (VALID_STATUSES as readonly string[]).includes(val);
}

export default createHandler({
  name: 'sources.manage',
  methods: ['GET', 'POST', 'PATCH'],
  auth: 'sources',
  cors: true,
  async handle({ req, log, deadlineAt }) {
    const authIdentity = await requireSourcesAuth(req);
    const orgId = authIdentity.orgId;

    const supabaseUrl = optionalEnv('SUPABASE_URL')?.replace(/\/+$/, '');
    const serviceKey = optionalEnv('SUPABASE_SERVICE_ROLE_KEY');
    const hasPersistence = isPersistenceConfigured() && Boolean(supabaseUrl && serviceKey);

    // =========================================================================
    // GET: List all sources for the authenticated organization
    // =========================================================================
    if (req.method === 'GET') {
      if (!hasPersistence || !supabaseUrl || !serviceKey) {
        log.info('sources.list.local', { orgId, count: DEFAULT_CATALOG.length });
        return {
          body: {
            sources: DEFAULT_CATALOG.map((item) => ({
              ...item,
              id: `${orgId}-${item.platform}`,
              organizationId: orgId,
            })),
            persistedTo: 'none',
          },
        };
      }

      const endpoint = `${supabaseUrl}/rest/v1/sources?organization_id=eq.${encodeURIComponent(orgId)}&select=*`;
      let dbRows: Record<string, unknown>[] = [];
      try {
        const result = await fetchJson<Record<string, unknown>[]>({
          upstream: 'Supabase',
          url: endpoint,
          method: 'GET',
          headers: {
            apikey: serviceKey,
            authorization: `Bearer ${serviceKey}`,
          },
          deadlineAt,
          log,
        });
        dbRows = Array.isArray(result.data) ? result.data : [];
      } catch (err) {
        log.warn('sources.list.fetch_failed', { error: toAppError(err).message });
        dbRows = [];
      }

      // Map DB rows to SourceRowDto
      const dbMap = new Map<ValidPlatform, SourceRowDto>();
      for (const row of dbRows) {
        if (isAllowedPlatform(row.platform)) {
          dbMap.set(row.platform, {
            id: String(row.id),
            platform: row.platform,
            status: isAllowedStatus(row.status) ? row.status : 'disconnected',
            connected: Boolean(row.connected),
            displayName: String(row.display_name ?? row.platform),
            feedbacksCount: Number(row.feedbacks_count ?? 0),
            lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
            configMetadata: sanitizeConfigMetadata(row.config_metadata),
            organizationId: String(row.organization_id ?? orgId),
          });
        }
      }

      // Complete full catalog ensuring all platforms exist
      const fullSources: SourceRowDto[] = DEFAULT_CATALOG.map((def) => {
        const fromDb = dbMap.get(def.platform);
        if (fromDb) return fromDb;
        return {
          ...def,
          id: `${orgId}-${def.platform}`,
          organizationId: orgId,
        };
      });

      log.info('sources.list.success', { orgId, count: fullSources.length, fromDb: dbMap.size });
      return {
        body: {
          sources: fullSources,
          persistedTo: 'supabase',
        },
      };
    }

    // =========================================================================
    // POST: Create or Update (Upsert) Source Configuration
    // =========================================================================
    if (req.method === 'POST') {
      let body: Record<string, unknown>;
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        throw badRequest('INVALID_JSON', 'Request body must be valid JSON.');
      }

      if (!isAllowedPlatform(body?.platform)) {
        throw badRequest('INVALID_PLATFORM', `Platform must be one of: ${VALID_PLATFORMS.join(', ')}.`);
      }

      const platform = body.platform;
      const status: ValidStatus = isAllowedStatus(body.status) ? body.status : 'operational';
      const connected = typeof body.connected === 'boolean' ? body.connected : true;
      const displayName = typeof body.displayName === 'string' && body.displayName.trim()
        ? body.displayName.trim().slice(0, 80)
        : platform;
      const feedbacksCount = typeof body.feedbacksCount === 'number' && Number.isInteger(body.feedbacksCount) && body.feedbacksCount >= 0
        ? body.feedbacksCount
        : 0;
      const lastSyncAt = typeof body.lastSyncAt === 'string' && body.lastSyncAt
        ? body.lastSyncAt
        : (connected ? new Date().toISOString() : null);
      const configMetadata = sanitizeConfigMetadata(body.configMetadata);

      const record: SourceRowDto = {
        id: `${orgId}-${platform}`,
        platform,
        organizationId: orgId,
        status,
        connected,
        displayName,
        feedbacksCount,
        lastSyncAt,
        configMetadata,
      };

      if (hasPersistence && supabaseUrl && serviceKey) {
        const endpoint = `${supabaseUrl}/rest/v1/sources?on_conflict=platform,organization_id`;
        await fetchJson({
          upstream: 'Supabase',
          url: endpoint,
          method: 'POST',
          headers: {
            apikey: serviceKey,
            authorization: `Bearer ${serviceKey}`,
            prefer: 'resolution=merge-duplicates,return=representation',
            'content-type': 'application/json',
          },
          body: [{
            id: record.id,
            platform: record.platform,
            organization_id: record.organizationId,
            status: record.status,
            connected: record.connected,
            display_name: record.displayName,
            feedbacks_count: record.feedbacksCount,
            last_sync_at: record.lastSyncAt,
            config_metadata: record.configMetadata,
            updated_at: new Date().toISOString(),
          }],
          deadlineAt,
          log,
        });

        log.info('sources.upsert.persisted', { orgId, platform, connected, status });
        return {
          body: {
            source: record,
            persistedTo: 'supabase',
          },
        };
      }

      log.info('sources.upsert.local', { orgId, platform, connected, status });
      return {
        body: {
          source: record,
          persistedTo: 'none',
        },
      };
    }

    // =========================================================================
    // PATCH: Update status or disconnect (PRESERVING FEEDBACK HISTORY)
    // =========================================================================
    if (req.method === 'PATCH') {
      let body: Record<string, unknown>;
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        throw badRequest('INVALID_JSON', 'Request body must be valid JSON.');
      }

      if (!isAllowedPlatform(body?.platform)) {
        throw badRequest('INVALID_PLATFORM', `Platform must be one of: ${VALID_PLATFORMS.join(', ')}.`);
      }

      const platform = body.platform;
      const isDisconnect = body.action === 'disconnect' || body.connected === false;
      const nextStatus: ValidStatus = isDisconnect ? 'disconnected' : (isAllowedStatus(body.status) ? body.status : 'operational');
      const nextConnected = !isDisconnect;

      const record: Partial<SourceRowDto> = {
        platform,
        organizationId: orgId,
        status: nextStatus,
        connected: nextConnected,
      };

      if (hasPersistence && supabaseUrl && serviceKey) {
        // Disconnecting ONLY updates public.sources. It NEVER touches the feedback table!
        const endpoint = `${supabaseUrl}/rest/v1/sources?platform=eq.${encodeURIComponent(platform)}&organization_id=eq.${encodeURIComponent(orgId)}`;
        await fetchJson({
          upstream: 'Supabase',
          url: endpoint,
          method: 'PATCH',
          headers: {
            apikey: serviceKey,
            authorization: `Bearer ${serviceKey}`,
            prefer: 'return=representation',
            'content-type': 'application/json',
          },
          body: {
            status: nextStatus,
            connected: nextConnected,
            updated_at: new Date().toISOString(),
          },
          deadlineAt,
          log,
        });

        log.info('sources.patch.persisted', { orgId, platform, action: isDisconnect ? 'disconnected' : 'updated' });
        return {
          body: {
            source: record,
            disconnected: isDisconnect,
            persistedTo: 'supabase',
          },
        };
      }

      log.info('sources.patch.local', { orgId, platform, action: isDisconnect ? 'disconnected' : 'updated' });
      return {
        body: {
          source: record,
          disconnected: isDisconnect,
          persistedTo: 'none',
        },
      };
    }

    throw badRequest('METHOD_NOT_SUPPORTED', 'Unsupported method.');
  },
});
