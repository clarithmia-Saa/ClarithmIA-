import { useCallback, useMemo, useState } from 'react';
import type { Translation } from '@/i18n';
import { Icon, type IconName } from '@/components/icons';
import FeedbackDetailModal, {
  type FeedbackActionState,
  type FeedbackChannel,
  type FeedbackItem,
  type FeedbackSentiment,
} from '@/components/FeedbackDetailModal';

type ActionsMap = Record<number, FeedbackActionState>;

const CHANNEL_ICONS: Record<FeedbackChannel, IconName> = {
  appstore: 'appWindow',
  twitter: 'x',
  support: 'lifeBuoy',
};

const SENTIMENT_ICONS: Record<FeedbackSentiment, IconName> = {
  positive: 'heart',
  neutral: 'minus',
  critical: 'zap',
};

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((part) => part[0]).join('');
}

function InboxView({
  t,
  actions,
  onActionsChange,
}: {
  t: Translation;
  actions: ActionsMap;
  onActionsChange: (updater: (prev: ActionsMap) => ActionsMap) => void;
}) {
  const [sentimentFilter, setSentimentFilter] = useState<FeedbackSentiment | 'all'>('all');
  const [channelFilter, setChannelFilter] = useState<FeedbackChannel | 'all'>('all');
  const [selected, setSelected] = useState<number | null>(null);

  const feedbacks = t.inbox.feedbacks as readonly FeedbackItem[];

  const filtered = useMemo(
    () =>
      feedbacks
        .map((fb, originalIndex) => ({ fb, originalIndex }))
        .filter(
          ({ fb }) =>
            (sentimentFilter === 'all' || fb.sentiment === sentimentFilter) &&
            (channelFilter === 'all' || fb.channel === channelFilter),
        ),
    [feedbacks, sentimentFilter, channelFilter],
  );

  const sentimentOptions: { id: FeedbackSentiment | 'all'; label: string }[] = [
    { id: 'all', label: t.inbox.filterAll },
    { id: 'positive', label: t.inbox.sentimentPositive },
    { id: 'neutral', label: t.inbox.sentimentNeutral },
    { id: 'critical', label: t.inbox.sentimentCritical },
  ];

  const channelOptions: { id: FeedbackChannel | 'all'; label: string }[] = [
    { id: 'all', label: t.inbox.filterAll },
    { id: 'appstore', label: t.inbox.channelAppStore },
    { id: 'twitter', label: t.inbox.channelTwitter },
    { id: 'support', label: t.inbox.channelSupport },
  ];

  const closeDetail = useCallback(() => setSelected(null), []);

  const selectedPos = selected === null ? -1 : filtered.findIndex((entry) => entry.originalIndex === selected);
  const prevEntry = selectedPos > 0 ? filtered[selectedPos - 1] : null;
  const nextEntry = selectedPos >= 0 && selectedPos < filtered.length - 1 ? filtered[selectedPos + 1] : null;
  const selectedItem = selected !== null ? feedbacks[selected] : null;

  function patchActions(index: number, patch: Partial<FeedbackActionState>) {
    onActionsChange((prev) => ({ ...prev, [index]: { ...(prev[index] ?? {}), ...patch } }));
  }

  return (
    <div className="inbox-view">
      <div className="inbox-header">
        <div>
          <p className="panel-kicker"><Icon name="inbox" size={13} /> {t.dashboard.workspace}</p>
          <h1 className="inbox-title">{t.inbox.title}</h1>
          <p className="inbox-subtitle">{t.inbox.subtitle}</p>
        </div>
        <span className="inbox-count">{t.inbox.resultsCount(filtered.length)}</span>
      </div>

      <div className="inbox-filters">
        <div className="filter-group">
          <span className="filter-label"><Icon name="sliders" size={12} /> {t.inbox.filterSentiment}</span>
          <div className="filter-pills">
            {sentimentOptions.map((opt) => (
              <button
                key={opt.id}
                className={`filter-pill ${sentimentFilter === opt.id ? 'active' : ''} ${opt.id !== 'all' ? opt.id : ''}`}
                onClick={() => setSentimentFilter(opt.id)}
              >
                {opt.id !== 'all' && <Icon name={SENTIMENT_ICONS[opt.id]} size={11} />}
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label"><Icon name="sliders" size={12} /> {t.inbox.filterChannel}</span>
          <div className="filter-pills">
            {channelOptions.map((opt) => (
              <button
                key={opt.id}
                className={`filter-pill ${channelFilter === opt.id ? 'active' : ''} ${opt.id !== 'all' ? opt.id : ''}`}
                onClick={() => setChannelFilter(opt.id)}
              >
                {opt.id !== 'all' && <Icon name={CHANNEL_ICONS[opt.id]} size={11} />}
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="inbox-empty"><Icon name="inbox" size={32} /><p>{t.inbox.noResults}</p></div>
      ) : (
        <div className="feedback-list">
          {filtered.map(({ fb, originalIndex }) => {
            const state = actions[originalIndex] ?? {};
            return (
              <article
                className={`feedback-card clickable ${state.resolved ? 'resolved' : ''}`}
                key={originalIndex}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(originalIndex)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(originalIndex);
                  }
                }}
              >
                <div className="feedback-main">
                  <div className="feedback-avatar">{initials(fb.author)}</div>
                  <div className="feedback-body">
                    <div className="feedback-meta">
                      <strong>{fb.author}</strong>
                      <span className="feedback-handle">{fb.handle}</span>
                      <span className={`feedback-channel ${fb.channel}`}><Icon name={CHANNEL_ICONS[fb.channel]} size={11} /> {fb.channel === 'appstore' ? t.inbox.channelAppStore : fb.channel === 'twitter' ? t.inbox.channelTwitter : t.inbox.channelSupport}</span>
                      <span className="feedback-time">{fb.time}</span>
                    </div>
                    <p className="feedback-text">{fb.text}</p>
                    <div className="feedback-tags">
                      <span className="ai-label">{t.inbox.aiTags}</span>
                      <span className={`tag-sentiment ${fb.sentiment}`}><Icon name={SENTIMENT_ICONS[fb.sentiment]} size={10} /> {fb.sentiment === 'positive' ? t.inbox.sentimentPositive : fb.sentiment === 'neutral' ? t.inbox.sentimentNeutral : t.inbox.sentimentCritical}</span>
                      <span className="tag-category">{t.inbox.labelCategory}: {fb.category}</span>
                      <span className={`tag-urgency ${fb.urgency}`}>{t.inbox.labelUrgency}: {fb.urgency === 'high' ? t.inbox.urgencyHigh : fb.urgency === 'medium' ? t.inbox.urgencyMedium : t.inbox.urgencyLow}</span>
                      {state.ticket && <span className="tag-action"><Icon name="ticket" size={10} /> {state.ticket}</span>}
                      {state.team && <span className="tag-action"><Icon name="userPlus" size={10} /> {t.feedbackDetail.teams[state.team]}</span>}
                      {state.escalated && <span className="tag-action"><Icon name="alert" size={10} /> {t.feedbackDetail.status.escalated}</span>}
                      {state.resolved && <span className="tag-action done"><Icon name="checkCircle" size={10} /> {t.feedbackDetail.status.resolved}</span>}
                    </div>
                  </div>
                  <span className="feedback-open" aria-hidden="true"><Icon name="chevronRight" size={18} /></span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedItem && selected !== null && selectedPos >= 0 && (
        <FeedbackDetailModal
          key={selected}
          t={t}
          item={selectedItem}
          index={selected}
          position={selectedPos + 1}
          total={filtered.length}
          actions={actions[selected] ?? {}}
          onChange={(patch) => patchActions(selected, patch)}
          onClose={closeDetail}
          onPrev={prevEntry ? () => setSelected(prevEntry.originalIndex) : null}
          onNext={nextEntry ? () => setSelected(nextEntry.originalIndex) : null}
        />
      )}
    </div>
  );
}

export default InboxView;
