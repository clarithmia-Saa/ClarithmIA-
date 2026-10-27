import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { Translation } from '@/i18n';

type Role = 'admin' | 'editor' | 'viewer';
type Status = 'active' | 'pending' | 'inactive';
type InviteError = 'email' | 'corporate' | 'duplicate' | null;
type IconName = 'plus' | 'search' | 'trash' | 'check' | 'x' | 'chevron' | 'refresh';

export type Member = {
  id: number;
  name: string;
  email: string;
  role: Role;
  status: Status;
  isYou?: boolean;
};

export type WorkspaceSettings = {
  name: string;
  slug: string;
  timezone: string;
  language: 'en' | 'pt';
  digest: boolean;
  alerts: boolean;
  autoTag: boolean;
};

const WS_ROLES: Role[] = ['admin', 'editor', 'viewer'];

const WS_FREE_DOMAINS = [
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'yahoo.com',
  'icloud.com',
  'live.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
];

const WS_TIMEZONES = [
  { value: 'America/Sao_Paulo', label: '(GMT-03:00) São Paulo' },
  { value: 'America/New_York', label: '(GMT-05:00) New York' },
  { value: 'Europe/London', label: '(GMT+00:00) London' },
  { value: 'Europe/Berlin', label: '(GMT+01:00) Berlin' },
  { value: 'Asia/Tokyo', label: '(GMT+09:00) Tokyo' },
];

export const WS_DEFAULTS: WorkspaceSettings = {
  name: 'Nova Labs',
  slug: 'nova-labs',
  timezone: 'America/Sao_Paulo',
  language: 'en',
  digest: true,
  alerts: true,
  autoTag: false,
};

export const WS_MEMBERS: Member[] = [
  { id: 1, name: 'Marina Costa', email: 'marina.costa@novalabs.com', role: 'admin', status: 'active', isYou: true },
  { id: 2, name: 'Rafael Almeida', email: 'rafael.almeida@novalabs.com', role: 'admin', status: 'active' },
  { id: 3, name: 'Camila Souza', email: 'camila.souza@novalabs.com', role: 'editor', status: 'active' },
  { id: 4, name: 'Diego Martins', email: 'diego.martins@novalabs.com', role: 'editor', status: 'pending' },
  { id: 5, name: 'Lucas Ferreira', email: 'lucas.ferreira@novalabs.com', role: 'viewer', status: 'active' },
  { id: 6, name: 'Ana Beatriz Lima', email: 'ana.lima@novalabs.com', role: 'viewer', status: 'inactive' },
];

function wsInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

function wsNameFromEmail(email: string) {
  const local = email.split('@')[0] ?? '';
  const words = local.split(/[._-]+/).filter(Boolean);
  if (words.length === 0) return email;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const WS_ICONS: Record<IconName, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />,
  check: <path d="M20 6 9 17l-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  refresh: <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />,
};

function WsIcon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {WS_ICONS[name]}
    </svg>
  );
}

function WsToggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="ws-toggle-row">
      <div className="ws-toggle-text">
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`ws-switch ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <i />
      </button>
    </div>
  );
}

function WorkspaceView({
  t,
  settings,
  onSettingsSave,
  members,
  onMembersChange,
}: {
  t: Translation;
  settings: WorkspaceSettings;
  onSettingsSave: (next: WorkspaceSettings) => void;
  members: Member[];
  onMembersChange: Dispatch<SetStateAction<Member[]>>;
}) {
  const w = t.workspace;

  // ---------- Workspace settings ----------
  const saved = settings;
  const [form, setForm] = useState<WorkspaceSettings>(settings);
  const [errors, setErrors] = useState<{ name: boolean; slug: boolean }>({ name: false, slug: false });
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  // ---------- Team ----------
  const setMembers = onMembersChange;
  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);

  // ---------- Invite modal ----------
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('viewer');
  const [inviteError, setInviteError] = useState<InviteError>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // ---------- Toast ----------
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!inviteOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => emailRef.current?.focus(), 60);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeInvite();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [inviteOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  }, [members, query]);

  function updateForm<K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function sanitizeSlug(value: string) {
    return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 32);
  }

  function saveSettings() {
    const nameInvalid = form.name.trim().length < 2;
    const slugInvalid = !/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(form.slug);
    setErrors({ name: nameInvalid, slug: slugInvalid });
    if (nameInvalid || slugInvalid || saving) return;
    setSaving(true);
    saveTimer.current = window.setTimeout(() => {
      const next = { ...form, name: form.name.trim() };
      onSettingsSave(next);
      setForm(next);
      setSaving(false);
      showToast(w.saved);
    }, 700);
  }

  function discardSettings() {
    setForm(saved);
    setErrors({ name: false, slug: false });
  }

  function changeRole(id: number, role: Role) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
    showToast(w.toastRole);
  }

  function removeMember(id: number) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    setConfirmId(null);
    showToast(w.toastRemoved);
  }

  function resendInvite(id: number) {
    const member = members.find((m) => m.id === id);
    if (member) showToast(`${w.toastResent} ${member.email}`);
  }

  function openInvite() {
    setInviteEmail('');
    setInviteRole('viewer');
    setInviteError(null);
    setInviteOpen(true);
  }

  function closeInvite() {
    setInviteOpen(false);
  }

  function submitInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setInviteError('email');
      return;
    }
    const domain = email.split('@')[1];
    if (WS_FREE_DOMAINS.includes(domain)) {
      setInviteError('corporate');
      return;
    }
    if (members.some((m) => m.email.toLowerCase() === email)) {
      setInviteError('duplicate');
      return;
    }
    const member: Member = {
      id: members.reduce((max, m) => Math.max(max, m.id), 0) + 1,
      name: wsNameFromEmail(email),
      email,
      role: inviteRole,
      status: 'pending',
    };
    setMembers((prev) => [...prev, member]);
    setInviteOpen(false);
    showToast(`${w.toastInvite} ${email}`);
  }

  const inviteErrorMessage =
    inviteError === 'email' ? w.errEmail : inviteError === 'corporate' ? w.errCorporate : inviteError === 'duplicate' ? w.errDuplicate : '';

  return (
    <div className="ws-view">
      <header className="ws-head">
        <p className="ws-kicker">{w.kicker}</p>
        <h1>{w.title}</h1>
        <p className="ws-sub">{w.subtitle}</p>
      </header>

      {/* ===== Workspace settings ===== */}
      <section className="ws-card" aria-labelledby="ws-settings-title">
        <div className="ws-card-head">
          <div>
            <h2 id="ws-settings-title">{w.settingsTitle}</h2>
            <p>{w.settingsDesc}</p>
          </div>
        </div>

        <form
          className="ws-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            saveSettings();
          }}
        >
          <div className="ws-grid">
            <div className="ws-field">
              <label htmlFor="ws-name">{w.companyName}</label>
              <input
                id="ws-name"
                className={`ws-input ${errors.name ? 'invalid' : ''}`}
                value={form.name}
                maxLength={60}
                placeholder={w.companyNamePlaceholder}
                aria-invalid={errors.name}
                onChange={(e) => updateForm('name', e.target.value)}
              />
              {errors.name && <small className="ws-error">{w.errName}</small>}
            </div>

            <div className="ws-field">
              <label htmlFor="ws-slug">{w.slug}</label>
              <div className={`ws-slug ${errors.slug ? 'invalid' : ''}`}>
                <span>clarithmia.app/</span>
                <input
                  id="ws-slug"
                  value={form.slug}
                  maxLength={32}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={errors.slug}
                  onChange={(e) => updateForm('slug', sanitizeSlug(e.target.value))}
                />
              </div>
              {errors.slug ? <small className="ws-error">{w.errSlug}</small> : <small className="ws-hint">{w.slugHint}</small>}
            </div>

            <div className="ws-field">
              <label htmlFor="ws-timezone">{w.timezone}</label>
              <div className="ws-select">
                <select id="ws-timezone" value={form.timezone} onChange={(e) => updateForm('timezone', e.target.value)}>
                  {WS_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
                <WsIcon name="chevron" size={16} />
              </div>
            </div>

            <div className="ws-field">
              <label htmlFor="ws-language">{w.language}</label>
              <div className="ws-select">
                <select
                  id="ws-language"
                  value={form.language}
                  onChange={(e) => updateForm('language', e.target.value as 'en' | 'pt')}
                >
                  <option value="en">English</option>
                  <option value="pt">Português</option>
                </select>
                <WsIcon name="chevron" size={16} />
              </div>
            </div>
          </div>

          <div className="ws-prefs">
            <h3>{w.preferences}</h3>
            <WsToggle checked={form.digest} onChange={(v) => updateForm('digest', v)} label={w.prefDigest} description={w.prefDigestDesc} />
            <WsToggle checked={form.alerts} onChange={(v) => updateForm('alerts', v)} label={w.prefAlerts} description={w.prefAlertsDesc} />
            <WsToggle checked={form.autoTag} onChange={(v) => updateForm('autoTag', v)} label={w.prefAutoTag} description={w.prefAutoTagDesc} />
          </div>

          <div className="ws-form-actions">
            {dirty && !saving && (
              <button type="button" className="ws-btn ghost" onClick={discardSettings}>{w.discard}</button>
            )}
            <button type="submit" className="ws-btn primary" disabled={!dirty || saving}>
              {saving ? w.saving : w.save}
            </button>
          </div>
        </form>
      </section>

      {/* ===== Team ===== */}
      <section className="ws-card" aria-labelledby="ws-team-title">
        <div className="ws-card-head ws-team-head">
          <div>
            <h2 id="ws-team-title">
              {w.teamTitle} <span className="ws-count">{members.length}</span>
            </h2>
            <p>{w.teamDesc}</p>
          </div>
          <div className="ws-team-tools">
            <button type="button" className="ws-btn primary glow" onClick={openInvite}>
              <WsIcon name="plus" size={17} />
              {w.invite}
            </button>
            <label className="ws-search">
              <WsIcon name="search" size={16} />
              <input
                type="search"
                value={query}
                placeholder={w.search}
                aria-label={w.search}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="ws-table" role="table" aria-label={w.teamTitle}>
          <div className="ws-row ws-row-head" role="row">
            <span role="columnheader">{w.colMember}</span>
            <span role="columnheader">{w.colRole}</span>
            <span role="columnheader">{w.colStatus}</span>
            <span role="columnheader" className="ws-col-actions">{w.colActions}</span>
          </div>

          {filtered.length === 0 && <div className="ws-empty">{w.empty}</div>}

          {filtered.map((m) => (
            <div className="ws-row" role="row" key={m.id}>
              <div className="ws-member" role="cell">
                <span className={`ws-avatar tone-${m.id % 4}`} aria-hidden="true">{wsInitials(m.name)}</span>
                <div className="ws-member-info">
                  <strong>
                    {m.name}
                    {m.isYou && <em className="ws-you">{w.you}</em>}
                  </strong>
                  <span>{m.email}</span>
                </div>
              </div>

              <div className="ws-cell-role" role="cell">
                {m.isYou ? (
                  <span className={`ws-badge ${m.role}`}>{w.roles[m.role]}</span>
                ) : (
                  <label className={`ws-badge select ${m.role}`}>
                    <select
                      value={m.role}
                      aria-label={`${w.colRole}: ${m.name}`}
                      onChange={(e) => changeRole(m.id, e.target.value as Role)}
                    >
                      {WS_ROLES.map((r) => (
                        <option key={r} value={r}>{w.roles[r]}</option>
                      ))}
                    </select>
                    <WsIcon name="chevron" size={13} />
                  </label>
                )}
              </div>

              <div className="ws-cell-status" role="cell">
                <span className={`ws-status ${m.status}`}>
                  <i />
                  {w.status[m.status]}
                </span>
              </div>

              <div className="ws-cell-actions" role="cell">
                {!m.isYou && confirmId !== m.id && (
                  <>
                    {m.status === 'pending' && (
                      <button
                        type="button"
                        className="ws-icon-btn"
                        aria-label={`${w.resend}: ${m.email}`}
                        title={w.resend}
                        onClick={() => resendInvite(m.id)}
                      >
                        <WsIcon name="refresh" size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="ws-icon-btn danger"
                      aria-label={`${w.remove}: ${m.name}`}
                      title={w.remove}
                      onClick={() => setConfirmId(m.id)}
                    >
                      <WsIcon name="trash" size={16} />
                    </button>
                  </>
                )}
                {!m.isYou && confirmId === m.id && (
                  <>
                    <button type="button" className="ws-icon-btn danger solid" aria-label={w.confirmRemove} title={w.confirmRemove} onClick={() => removeMember(m.id)}>
                      <WsIcon name="check" size={16} />
                    </button>
                    <button type="button" className="ws-icon-btn" aria-label={w.cancel} title={w.cancel} onClick={() => setConfirmId(null)}>
                      <WsIcon name="x" size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Invite modal ===== */}
      {inviteOpen && (
        <div
          className="ws-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeInvite();
          }}
        >
          <div className="ws-modal" role="dialog" aria-modal="true" aria-labelledby="ws-invite-title">
            <div className="ws-modal-head">
              <div>
                <h2 id="ws-invite-title">{w.inviteTitle}</h2>
                <p>{w.inviteDesc}</p>
              </div>
              <button type="button" className="ws-icon-btn" aria-label={w.close} onClick={closeInvite}>
                <WsIcon name="x" size={18} />
              </button>
            </div>

            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                submitInvite();
              }}
            >
              <div className="ws-field">
                <label htmlFor="ws-invite-email">{w.emailLabel}</label>
                <input
                  id="ws-invite-email"
                  ref={emailRef}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  className={`ws-input ${inviteError ? 'invalid' : ''}`}
                  value={inviteEmail}
                  placeholder={w.emailPlaceholder}
                  aria-invalid={inviteError !== null}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    if (inviteError) setInviteError(null);
                  }}
                />
                {inviteError && <small className="ws-error">{inviteErrorMessage}</small>}
              </div>

              <fieldset className="ws-roles">
                <legend>{w.roleLabel}</legend>
                {WS_ROLES.map((r) => (
                  <label key={r} className={`ws-role-card ${inviteRole === r ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="ws-invite-role"
                      value={r}
                      checked={inviteRole === r}
                      onChange={() => setInviteRole(r)}
                    />
                    <span className={`ws-badge ${r}`}>{w.roles[r]}</span>
                    <small>{w.roleDesc[r]}</small>
                  </label>
                ))}
              </fieldset>

              <div className="ws-modal-actions">
                <button type="button" className="ws-btn ghost" onClick={closeInvite}>{w.cancel}</button>
                <button type="submit" className="ws-btn primary">{w.sendInvite}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="ws-toast" role="status" aria-live="polite">
          <WsIcon name="check" size={15} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

export default WorkspaceView;
