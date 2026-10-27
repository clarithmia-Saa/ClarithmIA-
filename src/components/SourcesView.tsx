import { useMemo, useState } from 'react';
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

function SourcesView({ t }: { t: Translation }) {
  const initial = t.sources.sources as readonly SourceRow[];
  const [sources, setSources] = useState<SourceRow[]>(() => initial.map((s) => ({ ...s })));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [target, setTarget] = useState<ConnectTarget | null>(null);

  const connectedCount = useMemo(() => sources.filter((s) => s.connected).length, [sources]);

  const connectedPlatforms = useMemo(() => {
    const set = new Set<PlatformId>();
    sources.forEach((s) => {
      if (s.connected) set.add(s.platform);
    });
    return set;
  }, [sources]);

  function disconnect(index: number) {
    setSources((prev) =>
      prev.map((s, i) => (i === index ? { ...s, connected: false, status: 'disconnected', lastSync: '—' } : s)),
    );
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
        <button className="button button-dark sources-add" onClick={() => setPickerOpen(true)}>
          <Icon name="plus" size={16} /> {t.sources.connectNew}
        </button>
      </div>

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

      <div className="sources-grid">
        {sources.map((source, index) => {
          const PlatformIcon = PLATFORM_ICONS[source.platform];
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
                    <button className="source-action disconnect" onClick={() => disconnect(index)}>{t.sources.disconnect}</button>
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
