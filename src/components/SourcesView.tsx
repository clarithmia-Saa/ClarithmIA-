import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Translation } from '@/i18n';
import { Icon } from '@/components/icons';
import { ConnectSourceModal, SourcePickerModal } from '@/components/IntegrationModals';
import {
  PLATFORM_ICONS,
  platformDesc,
  platformLabel,
  statusLabel,
  type PlatformId,
  type StatusId,
} from '@/components/platforms';

type SourceRow = {
  platform: PlatformId;
  status: StatusId;
  count: string;
  lastSync: string;
  connected: boolean;
};

type ConnectTarget = { platform: PlatformId; mode: 'connect' | 'configure'; index: number | null };

function formatLastSync(iso: string | null, t: Translation): string {
  if (!iso) return '—';
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    if (diffMs < 60_000) return t.language === 'PT' ? 'agora' : 'just now';
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 60) return t.language === 'PT' ? `há ${mins} min` : `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t.language === 'PT' ? `há ${hours}h` : `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return t.language === 'PT' ? `há ${days}d` : `${days}d ago`;
  } catch {
    return '—';
  }
}

interface RawSourceItem {
  platform: PlatformId;
  status: StatusId;
  feedbacksCount?: number;
  lastSyncAt?: string | null;
  connected?: boolean;
}

function SourcesView({ t }: { t: Translation }) {
  const initial = t.sources.sources as readonly SourceRow[];
  const [sources, setSources] = useState<SourceRow[]>(() => initial.map((s) => ({ ...s })));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<PlatformId | null>(null);
  const [persistedTarget, setPersistedTarget] = useState<'supabase' | 'none' | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [target, setTarget] = useState<ConnectTarget | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchSources = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setLoadError(null);

    try {
      const response = await fetch('/api/sources', {
        method: 'GET',
        headers: {
          authorization: 'Bearer session_default_clarithmia',
        },
        signal: ac.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (Array.isArray(data.sources)) {
        const rows: SourceRow[] = (data.sources as RawSourceItem[]).map((item: RawSourceItem) => ({
          platform: item.platform,
          status: item.status,
          count: item.feedbacksCount ? Number(item.feedbacksCount).toLocaleString(t.language === 'PT' ? 'pt-BR' : 'en-US') : '0',
          lastSync: formatLastSync(item.lastSyncAt ?? null, t),
          connected: Boolean(item.connected),
        }));
        setSources(rows);
        setPersistedTarget(data.persistedTo ?? 'none');
      }
    } catch {
      if (!ac.signal.aborted) {
        setLoadError(t.sources.errorLoading);
      }
    } finally {
      if (!ac.signal.aborted) {
        setLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    fetchSources();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchSources]);

  const connectedCount = useMemo(() => sources.filter((s) => s.connected).length, [sources]);

  const connectedPlatforms = useMemo(() => {
    const set = new Set<PlatformId>();
    sources.forEach((s) => {
      if (s.connected) set.add(s.platform);
    });
    return set;
  }, [sources]);

  async function disconnect(platform: PlatformId) {
    if (disconnecting) return;
    setDisconnecting(platform);
    setFeedbackNotice(null);

    try {
      const response = await fetch('/api/sources', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer session_default_clarithmia',
        },
        body: JSON.stringify({
          platform,
          action: 'disconnect',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Update local state: feedback is preserved in the database
      setSources((prev) =>
        prev.map((s) => (s.platform === platform ? { ...s, connected: false, status: 'disconnected', lastSync: '—' } : s)),
      );
      setFeedbackNotice(t.sources.disconnectSuccess);
      window.setTimeout(() => setFeedbackNotice(null), 5000);
    } catch {
      setFeedbackNotice(t.sources.disconnectError);
      window.setTimeout(() => setFeedbackNotice(null), 5000);
    } finally {
      setDisconnecting(null);
    }
  }

  function markConnected(platform: PlatformId, index: number | null, meta?: { count?: string; lastSync?: string }) {
    setSources((prev) => {
      const existing = index !== null ? index : prev.findIndex((s) => s.platform === platform && !s.connected);
      const nextSync = meta?.lastSync ?? (t.language === 'PT' ? 'agora' : 'just now');
      const nextCount = meta?.count ?? '1';
      if (existing >= 0 && prev[existing]) {
        return prev.map((s, i) =>
          i === existing
            ? { ...s, connected: true, status: 'operational', lastSync: nextSync, count: s.count === '0' ? nextCount : s.count }
            : s,
        );
      }
      return [...prev, { platform, status: 'operational', count: nextCount, lastSync: nextSync, connected: true }];
    });
  }

  return (
    <div className="sources-view">
      <div className="sources-header">
        <div>
          <p className="panel-kicker"><Icon name="database" size={13} /> {t.dashboard.connectivity}</p>
          <h1 className="sources-title">{t.sources.title}</h1>
          <p className="sources-subtitle">{t.sources.subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {persistedTarget === 'supabase' && (
            <span
              style={{
                fontSize: '11px',
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'rgba(52, 211, 153, 0.1)',
                color: '#34d399',
                border: '1px solid rgba(52, 211, 153, 0.2)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Icon name="check" size={12} />
              {t.sources.storageStatusSupabase}
            </span>
          )}
          <button className="button button-dark sources-add" onClick={() => setPickerOpen(true)}>
            <Icon name="plus" size={16} /> {t.sources.connectNew}
          </button>
        </div>
      </div>

      {feedbackNotice && (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            color: '#7dd3fc',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="checkCircle" size={16} />
            <span>{feedbackNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackNotice(null)}
            style={{ background: 'none', border: 'none', color: '#7dd3fc', cursor: 'pointer' }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#f87171',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="x" size={16} />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            className="source-action configure"
            onClick={fetchSources}
            style={{ padding: '4px 10px', fontSize: '12px' }}
          >
            <Icon name="refresh" size={12} /> {t.sources.retry}
          </button>
        </div>
      )}

      <div className="sources-summary">
        <div className="sources-summary-card">
          <span className="sources-summary-value">{connectedCount.toString().padStart(2, '0')}</span>
          <span className="sources-summary-label">{t.sources.connectedCount(connectedCount)}</span>
        </div>
        <div className="sources-summary-card">
          <span className="sources-summary-value operational-dot">{t.sources.statusOperational}</span>
          <span className="sources-summary-label">{t.dashboard.operational}</span>
        </div>
      </div>

      {loading ? (
        <div className="sources-grid" aria-busy="true" aria-label={t.sources.loadingSources}>
          {Array.from({ length: 6 }).map((_, i) => (
            <article className="source-card disconnected" key={`skeleton-${i}`} style={{ opacity: 0.6 }}>
              <div className="source-card-top">
                <span className="source-platform-icon" style={{ background: '#1e293b' }} />
                <span className="source-status-badge disconnected">...</span>
              </div>
              <div style={{ height: 18, width: '40%', background: '#334155', borderRadius: 4, margin: '8px 0' }} />
              <div style={{ height: 12, width: '80%', background: '#1e293b', borderRadius: 4, margin: '4px 0' }} />
            </article>
          ))}
        </div>
      ) : (
        <div className="sources-grid">
          {sources.map((source, index) => {
            const PlatformIcon = PLATFORM_ICONS[source.platform];
            const isDisconnectingThis = disconnecting === source.platform;
            return (
              <article className={`source-card ${source.connected ? 'connected' : 'disconnected'}`} key={`${source.platform}-${index}`}>
                <div className="source-card-top">
                  <span className={`source-platform-icon ${source.platform}`}><PlatformIcon size={22} /></span>
                  <span className={`source-status-badge ${source.status}`}>
                    {source.status === 'operational' && <Icon name="check" size={10} />}
                    {source.status === 'syncing' && <Icon name="refresh" size={10} className="spin" />}
                    {source.status === 'disconnected' && <Icon name="plug" size={10} />}
                    {source.status === 'error' && <Icon name="x" size={10} />}
                    {statusLabel(t, source.status)}
                  </span>
                </div>
                <h3 className="source-card-name">{platformLabel(t, source.platform)}</h3>
                <p className="source-card-desc">{platformDesc(t, source.platform)}</p>
                <div className="source-card-stats">
                  <div>
                    <strong>{source.count}</strong>
                    <span>{t.sources.feedbacksCaptured}</span>
                  </div>
                  <div>
                    <strong>{source.lastSync}</strong>
                    <span>{t.sources.lastSync}</span>
                  </div>
                </div>
                <div className="source-card-actions">
                  {source.connected ? (
                    <>
                      <button className="source-action configure" onClick={() => setTarget({ platform: source.platform, mode: 'configure', index })}>
                        <Icon name="settings" size={13} /> {t.sources.configure}
                      </button>
                      <button
                        className="source-action disconnect"
                        disabled={isDisconnectingThis}
                        onClick={() => disconnect(source.platform)}
                      >
                        {isDisconnectingThis ? (
                          <><Icon name="refresh" size={12} className="spin" /> {t.sources.disconnecting}</>
                        ) : (
                          t.sources.disconnect
                        )}
                      </button>
                    </>
                  ) : (
                    <button className="source-action connect" onClick={() => setTarget({ platform: source.platform, mode: 'connect', index })}>
                      <Icon name="plugZap" size={13} /> {t.sources.connect}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pickerOpen && (
        <SourcePickerModal
          t={t}
          connected={connectedPlatforms}
          onClose={() => setPickerOpen(false)}
          onSelect={(platform) => {
            setPickerOpen(false);
            setTarget({ platform, mode: 'connect', index: null });
          }}
        />
      )}

      {target && (
        <ConnectSourceModal
          key={`${target.platform}-${target.mode}-${target.index}`}
          t={t}
          platform={target.platform}
          mode={target.mode}
          onClose={() => setTarget(null)}
          onConnected={(platform, meta) => markConnected(platform, target.index, meta)}
        />
      )}
    </div>
  );
}

export default SourcesView;
