import { useEffect, useRef, useState } from 'react';
import type { Translation } from '@/i18n';
import { Icon, type IconName } from '@/components/icons';

export type FeedbackChannel = 'appstore' | 'twitter' | 'support';
export type FeedbackSentiment = 'positive' | 'neutral' | 'critical';
export type TeamId = 'product' | 'engineering' | 'support' | 'design';

export type FeedbackItem = {
  author: string;
  handle: string;
  channel: FeedbackChannel;
  sentiment: FeedbackSentiment;
  category: string;
  urgency: string;
  time: string;
  text: string;
};

export type FeedbackActionState = {
  ticket?: string;
  team?: TeamId;
  escalated?: boolean;
  roadmap?: boolean;
  replied?: boolean;
  resolved?: boolean;
};

const FD_TEAMS: TeamId[] = ['product', 'engineering', 'support', 'design'];

export function fdTicketId(index: number) {
  return `PRD-${480 + index}`;
}

function fdTone(score: number) {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

function fdInitials(name: string) {
  return name.split(' ').slice(0, 2).map((part) => part[0]).join('');
}

function FdGauge({ value, label }: { value: number; label: string }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, value)) / 100) * circumference;
  return (
    <svg className="fd-gauge-svg" viewBox="0 0 120 120" width="120" height="120" role="img" aria-label={`${label}: ${value}/100`}>
      <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(148,163,184,.18)" strokeWidth="9" />
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="60" textAnchor="middle" dominantBaseline="central" className="fd-gauge-value">{value}</text>
    </svg>
  );
}

function FdMeter({ label, value, valueLabel }: { label: string; value: number; valueLabel?: string }) {
  return (
    <div className="fd-meter">
      <div className="fd-meter-head">
        <span>{label}</span>
        <strong>{valueLabel ?? `${value}%`}</strong>
      </div>
      <div className="fd-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label}>
        <i style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function FeedbackDetailModal({
  t,
  item,
  index,
  position,
  total,
  actions,
  onChange,
  onClose,
  onPrev,
  onNext,
}: {
  t: Translation;
  item: FeedbackItem;
  index: number;
  position: number;
  total: number;
  actions: FeedbackActionState;
  onChange: (patch: Partial<FeedbackActionState>) => void;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  const d = t.feedbackDetail;
  const analysis = d.analyses[index];
  const [assignOpen, setAssignOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState(analysis ? analysis.reply : '');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const channelLabel = item.channel === 'appstore' ? t.inbox.channelAppStore : item.channel === 'twitter' ? t.inbox.channelTwitter : t.inbox.channelSupport;
  const sentimentLabel = item.sentiment === 'positive' ? t.inbox.sentimentPositive : item.sentiment === 'neutral' ? t.inbox.sentimentNeutral : t.inbox.sentimentCritical;
  const ticketId = fdTicketId(index);
  const nf = new Intl.NumberFormat(t.billing.locale);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, [onClose]);

  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }

  function createTicket() {
    if (actions.ticket) return;
    onChange({ ticket: ticketId });
    notify(d.toast.ticket.replace('{id}', ticketId));
  }

  function assign(team: TeamId) {
    onChange({ team });
    setAssignOpen(false);
    notify(d.toast.assigned.replace('{team}', d.teams[team]));
  }

  function escalate() {
    if (actions.escalated) return;
    onChange({ escalated: true });
    notify(d.toast.escalated);
  }

  function addToRoadmap() {
    if (actions.roadmap) return;
    onChange({ roadmap: true });
    notify(d.toast.roadmap);
  }

  function sendReply() {
    if (replyText.trim().length === 0) return;
    onChange({ replied: true });
    setReplyOpen(false);
    notify(d.toast.replied.replace('{author}', item.author));
  }

  function toggleResolved() {
    if (actions.resolved) {
      onChange({ resolved: false });
      notify(d.toast.reopened);
    } else {
      onChange({ resolved: true });
      notify(d.toast.resolved);
    }
  }

  const score = analysis ? analysis.urgency : item.urgency === 'high' ? 85 : item.urgency === 'medium' ? 50 : 15;
  const tone = fdTone(score);

  const statusChips: { key: string; icon: IconName; text: string }[] = [];
  if (actions.ticket) statusChips.push({ key: 'ticket', icon: 'ticket', text: d.status.ticket.replace('{id}', actions.ticket) });
  if (actions.team) statusChips.push({ key: 'team', icon: 'userPlus', text: d.status.assigned.replace('{team}', d.teams[actions.team]) });
  if (actions.escalated) statusChips.push({ key: 'esc', icon: 'alert', text: d.status.escalated });
  if (actions.roadmap) statusChips.push({ key: 'road', icon: 'flag', text: d.status.roadmap });
  if (actions.replied) statusChips.push({ key: 'rep', icon: 'reply', text: d.status.replied });
  if (actions.resolved) statusChips.push({ key: 'res', icon: 'checkCircle', text: d.status.resolved });

  return (
    <div
      className="fd-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="fd-panel" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="fd-title">
        <header className="fd-head">
          <div className="fd-head-title">
            <h2 id="fd-title">{d.title}</h2>
            <span>{d.positionOf.replace('{current}', String(position)).replace('{total}', String(total))}</span>
          </div>
          <div className="fd-head-actions">
            <button type="button" className="fd-icon-btn" aria-label={d.previous} disabled={!onPrev} onClick={() => { onPrev?.(); bodyRef.current?.scrollTo(0, 0); }}>
              <Icon name="chevronLeft" size={18} />
            </button>
            <button type="button" className="fd-icon-btn" aria-label={d.next} disabled={!onNext} onClick={() => { onNext?.(); bodyRef.current?.scrollTo(0, 0); }}>
              <Icon name="chevronRight" size={18} />
            </button>
            <button type="button" className="fd-icon-btn" aria-label={d.close} onClick={onClose}>
              <Icon name="x" size={18} />
            </button>
          </div>
        </header>

        <div className="fd-body" ref={bodyRef}>
          <div className="fd-author">
            <span className="fd-avatar">{fdInitials(item.author)}</span>
            <div className="fd-author-info">
              <strong>{item.author}</strong>
              <span>{item.handle} · {item.time}</span>
            </div>
          </div>
          <div className="fd-chips">
            <span className="fd-chip">{channelLabel}</span>
            <span className={`fd-chip sentiment ${item.sentiment}`}>{sentimentLabel}</span>
            <span className="fd-chip">{item.category}</span>
          </div>

          {statusChips.length > 0 && (
            <div className="fd-status" aria-live="polite">
              {statusChips.map((chip) => (
                <span className="fd-status-chip" key={chip.key}><Icon name={chip.icon} size={13} /> {chip.text}</span>
              ))}
            </div>
          )}

          <section className="fd-section">
            <h3>{d.original}</h3>
            <blockquote className="fd-quote">{item.text}</blockquote>
          </section>

          <section className="fd-section fd-urgency">
            <h3>{d.urgencyScore}</h3>
            <div className="fd-urgency-grid">
              <div className={`fd-gauge ${tone}`}>
                <FdGauge value={score} label={d.urgencyScore} />
                <span className="fd-level">{d.urgencyLevels[tone]}</span>
              </div>
              {analysis && (
                <div className="fd-meters">
                  <FdMeter label={d.metrics.sentiment} value={analysis.sentiment} valueLabel={`${analysis.sentiment}% · ${sentimentLabel}`} />
                  <FdMeter label={d.metrics.impact} value={analysis.impact} />
                  <FdMeter label={d.metrics.confidence} value={analysis.confidence} />
                </div>
              )}
            </div>
            {analysis && (
              <div className="fd-facts">
                <span><Icon name="users" size={14} /> {d.usersAffected.replace('{count}', nf.format(analysis.users))}</span>
                <span><Icon name="sparkles" size={14} /> {d.similar.replace('{count}', nf.format(analysis.similar))}</span>
              </div>
            )}
          </section>

          <section className="fd-section">
            <h3>{d.quickActions}</h3>
            <div className="fd-actions">
              <button type="button" className={`fd-action primary ${actions.ticket ? 'done' : ''}`} onClick={createTicket} disabled={Boolean(actions.ticket)}>
                <Icon name={actions.ticket ? 'check' : 'ticket'} size={16} />
                {actions.ticket ? d.status.ticket.replace('{id}', actions.ticket) : d.actions.ticket}
              </button>
              <button type="button" className={`fd-action ${actions.team ? 'done' : ''}`} aria-expanded={assignOpen} onClick={() => { setAssignOpen((v) => !v); setReplyOpen(false); }}>
                <Icon name="userPlus" size={16} />
                {actions.team ? d.status.assigned.replace('{team}', d.teams[actions.team]) : d.actions.assign}
              </button>
              <button type="button" className={`fd-action ${actions.escalated ? 'done' : ''}`} onClick={escalate} disabled={Boolean(actions.escalated)}>
                <Icon name={actions.escalated ? 'check' : 'alert'} size={16} />
                {actions.escalated ? d.status.escalated : d.actions.escalate}
              </button>
              <button type="button" className={`fd-action ${actions.roadmap ? 'done' : ''}`} onClick={addToRoadmap} disabled={Boolean(actions.roadmap)}>
                <Icon name={actions.roadmap ? 'check' : 'flag'} size={16} />
                {actions.roadmap ? d.status.roadmap : d.actions.roadmap}
              </button>
              <button type="button" className={`fd-action ${actions.replied ? 'done' : ''}`} aria-expanded={replyOpen} onClick={() => { setReplyOpen((v) => !v); setAssignOpen(false); }}>
                <Icon name="reply" size={16} />
                {actions.replied ? d.status.replied : d.actions.reply}
              </button>
              <button type="button" className={`fd-action ${actions.resolved ? 'resolved' : ''}`} onClick={toggleResolved}>
                <Icon name={actions.resolved ? 'rotate' : 'checkCircle'} size={16} />
                {actions.resolved ? d.actions.reopen : d.actions.resolve}
              </button>
            </div>

            {assignOpen && (
              <div className="fd-assign" role="group" aria-label={d.assignTitle}>
                <span>{d.assignTitle}</span>
                <div className="fd-assign-options">
                  {FD_TEAMS.map((team) => (
                    <button
                      key={team}
                      type="button"
                      className={`fd-team ${actions.team === team ? 'active' : ''}`}
                      onClick={() => assign(team)}
                    >
                      {d.teams[team]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {replyOpen && (
              <div className="fd-reply">
                <label htmlFor="fd-reply-text">{d.replyTitle}</label>
                <textarea
                  id="fd-reply-text"
                  rows={5}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <small>{d.replyHint}</small>
                <button type="button" className="fd-action primary" onClick={sendReply} disabled={replyText.trim().length === 0}>
                  <Icon name="reply" size={16} /> {d.sendReply}
                </button>
              </div>
            )}
          </section>

          {analysis && (
            <section className="fd-section">
              <h3><Icon name="sparkles" size={14} /> {d.analysisTitle}</h3>
              <div className="fd-analysis">
                <div>
                  <h4>{d.summary}</h4>
                  <p>{analysis.summary}</p>
                </div>
                <div>
                  <h4>{d.rootCause}</h4>
                  <p>{analysis.rootCause}</p>
                </div>
                <div>
                  <h4>{d.topics}</h4>
                  <div className="fd-chips">
                    {analysis.topics.map((topic) => (
                      <span className="fd-chip" key={topic}>{topic}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <h4>{d.recommendations}</h4>
                  <ol className="fd-steps">
                    {analysis.recommendations.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              </div>
            </section>
          )}
        </div>

        {toast && (
          <div className="fd-toast" role="status" aria-live="polite">
            <Icon name="check" size={15} />
            <span>{toast}</span>
          </div>
        )}
      </aside>
    </div>
  );
}

export default FeedbackDetailModal;
