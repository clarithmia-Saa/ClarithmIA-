import { useEffect, useMemo, useRef, useState } from 'react';
import type { Translation } from '@/i18n';

type TmRole = 'admin' | 'editor' | 'viewer';
type TmStatus = 'active' | 'pending';

type TmMember = {
  id: number;
  name: string;
  email: string;
  role: TmRole;
  status: TmStatus;
  owner?: boolean;
  you?: boolean;
};

type TmSettings = {
  company: string;
  slug: string;
  language: 'en' | 'pt';
  timezone: string;
  digest: boolean;
  alerts: boolean;
};

const TM_ROLES: TmRole[] = ['admin', 'editor', 'viewer'];

const TM_TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (GMT-3)' },
  { value: 'America/New_York', label: 'America/New_York (GMT-5)' },
  { value: 'Europe/London', label: 'Europe/London (GMT+0)' },
  { value: 'Europe/Lisbon', label: 'Europe/Lisbon (GMT+0)' },
  { value: 'UTC', label: 'UTC' },
];

const TM_PERSONAL_DOMAINS = [
  'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'live.com',
  'proton.me', 'protonmail.com', 'aol.com', 'gmx.com', 'bol.com.br', 'uol.com.br', 'terra.com.br',
];

const TM_INITIAL_SETTINGS: TmSettings = {
  company: 'Clarithm Labs',
  slug: 'clarithm-labs',
  language: 'en',
  timezone: 'America/Sao_Paulo',
  digest: true,
  alerts: true,
};

const TM_INITIAL_MEMBERS: TmMember[] = [
  { id: 1, name: 'Marina Costa', email: 'marina.costa@clarithmlabs.com', role: 'admin', status: 'active', owner: true, you: true },
  { id: 2, name: 'Rafael Almeida', email: 'rafael.almeida@clarithmlabs.com', role: 'admin', status: 'active' },
  { id: 3, name: 'Beatriz Nogueira', email: 'beatriz.nogueira@clarithmlabs.com', role: 'editor', status: 'active' },
  { id: 4, name: 'Lucas Ferreira', email: 'lucas.ferreira@clarithmlabs.com', role: 'editor', status: 'active' },
  { id: 5, name: 'Thiago Martins', email: 'thiago.martins@clarithmlabs.com', role: 'viewer', status: 'active' },
  { id: 6, name: 'Camila Duarte', email: 'camila.duarte@clarithmlabs.com', role: 'viewer', status: 'pending' },
];

const TM_ICON_PATHS = {
  plus: 'M12 5v14M5 12h14',
  search: 'M21 21l-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  chevron: 'M6 9l6 6 6-6',
  close: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  building: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M9 7h2M9 11h2M9 15h2M2 21h20',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
} as const;

type TmIconName = keyof typeof TM_ICON_PATHS;

function TmIcon({ name, size = 18, stroke = 1.8 }: { name: TmIconName; size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={TM_ICON_PATHS[name]} />
    </svg>
  );
}

function tmSlugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').slice(0, 32);
}

function tmNameFromEmail(email: string) {
  const local = email.split('@')[0] || '';
  const words = local.split(/[._-]+/).filter(Boolean);
  if (words.length === 0) return email;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function tmInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '';
  const second = parts.length > 1 ? parts[1].charAt(0) : '';
  return (first + second).toUpperCase();
}

function TmSwitch({
  id,
  checked,
  onChange,
  label,
  desc,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  desc: string;
}) {
  return (
    <div className="tm-switch-row">
      <div className="tm-switch-text">
        <label htmlFor={id}>{label}</label>
        <p>{desc}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={`tm-switch ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

function SettingsView({ t }: { t: Translation }) {
  const tm = t.team;

  const [saved, setSaved] = useState<TmSettings>(TM_INITIAL_SETTINGS);
  const [draft, setDraft] = useState<TmSettings>(TM_INITIAL_SETTINGS);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  const [members, setMembers] = useState<TmMember[]>(TM_INITIAL_MEMBERS);
  const [query, setQuery] = useState('');
  const [menuId, setMenuId] = useState<number | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TmRole>('editor');
  const [inviteError, setInviteError] = useState('');

  const [toast, setToast] = useState('');

  const nextId = useRef(100);
  const emailRef = useRef<HTMLInputElement>(null);
  const inviteBtnRef = useRef<HTMLButtonElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const nameError = draft.company.trim() ? '' : tm.requiredField;
  const slugError = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(draft.slug) ? '' : tm.slugInvalid;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        tm.roles[m.role].toLowerCase().includes(q),
    );
  }, [members, query, tm]);

  useEffect(() => {
    return () => {
      window.clearTimeout(toastTimer.current);
      window.clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (menuId === null) return;
    function onDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (!target || !target.closest('[data-tm-menu]')) setMenuId(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuId(null);
    }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuId]);

  useEffect(() => {
    if (!inviteOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => emailRef.current?.focus(), 40);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeInvite();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
    };
  }, [inviteOpen]);

  function notify(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3200);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (nameError || slugError || !dirty || saving) return;
    setSaving(true);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const clean = { ...draft, company: draft.company.trim() };
      setSaved(clean);
      setDraft(clean);
      setSaving(false);
      setShowErrors(false);
      notify(tm.saved);
    }, 700);
  }

  function handleDiscard() {
    setDraft(saved);
    setShowErrors(false);
  }

  function openInvite() {
    setInviteEmail('');
    setInviteRole('editor');
    setInviteError('');
    setMenuId(null);
    setInviteOpen(true);
  }

  function closeInvite() {
    setInviteOpen(false);
    window.setTimeout(() => inviteBtnRef.current?.focus(), 0);
  }

  function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setInviteError(tm.emailInvalid);
      return;
    }
    const domain = email.split('@')[1];
    if (TM_PERSONAL_DOMAINS.includes(domain)) {
      setInviteError(tm.emailPersonal);
      return;
    }
    if (members.some((m) => m.email.toLowerCase() === email)) {
      setInviteError(tm.emailDuplicate);
      return;
    }
    nextId.current += 1;
    const created: TmMember = {
      id: nextId.current,
      name: tmNameFromEmail(email),
      email,
      role: inviteRole,
      status: 'pending',
    };
    setMembers((prev) => [...prev, created]);
    setQuery('');
    setInviteOpen(false);
    notify(`${tm.inviteSent} ${email}`);
  }

  function changeRole(id: number, role: TmRole) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
    setMenuId(null);
    notify(tm.roleUpdated);
  }

  function removeMember(id: number) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    setMenuId(null);
    notify(tm.memberRemoved);
  }

  function resendInvite() {
    setMenuId(null);
    notify(tm.inviteResent);
  }

  return (
    <div className="tm-view">
      <header className="tm-head">
        <h1>{tm.title}</h1>
        <p>{tm.subtitle}</p>
      </header>

      <form className="tm-card" onSubmit={handleSave} noValidate>
        <div className="tm-card-head">
          <div className="tm-card-title">
            <span className="tm-card-icon"><TmIcon name="building" size={20} /></span>
            <div>
              <h2>{tm.workspaceTitle}</h2>
              <p>{tm.workspaceDesc}</p>
            </div>
          </div>
        </div>

        <div className="tm-grid">
          <div className="tm-field">
            <label htmlFor="tm-company">{tm.companyName}</label>
            <input
              id="tm-company"
              className={`tm-input ${showErrors && nameError ? 'invalid' : ''}`}
              value={draft.company}
              onChange={(e) => setDraft((d) => ({ ...d, company: e.target.value }))}
              placeholder={tm.companyNamePlaceholder}
              autoComplete="organization"
              aria-invalid={showErrors && !!nameError}
            />
            {showErrors && nameError && <span className="tm-error">{nameError}</span>}
          </div>

          <div className="tm-field">
            <label htmlFor="tm-slug">{tm.slug}</label>
            <div className={`tm-slug ${showErrors && slugError ? 'invalid' : ''}`}>
              <span className="tm-slug-prefix">clarithmia.app/</span>
              <input
                id="tm-slug"
                className="tm-input"
                value={draft.slug}
                onChange={(e) => setDraft((d) => ({ ...d, slug: tmSlugify(e.target.value) }))}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={showErrors && !!slugError}
              />
            </div>
            {showErrors && slugError ? (
              <span className="tm-error">{slugError}</span>
            ) : (
              <span className="tm-hint">{tm.slugHint}</span>
            )}
          </div>

          <div className="tm-field">
            <label htmlFor="tm-language">{tm.language}</label>
            <div className="tm-select">
              <select
                id="tm-language"
                className="tm-input"
                value={draft.language}
                onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value as 'en' | 'pt' }))}
              >
                <option value="en">English</option>
                <option value="pt">Português</option>
              </select>
              <TmIcon name="chevron" size={16} />
            </div>
          </div>

          <div className="tm-field">
            <label htmlFor="tm-timezone">{tm.timezone}</label>
            <div className="tm-select">
              <select
                id="tm-timezone"
                className="tm-input"
                value={draft.timezone}
                onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))}
              >
                {TM_TIMEZONES.map((zone) => (
                  <option key={zone.value} value={zone.value}>{zone.label}</option>
                ))}
              </select>
              <TmIcon name="chevron" size={16} />
            </div>
          </div>
        </div>

        <div className="tm-switches">
          <TmSwitch
            id="tm-digest"
            checked={draft.digest}
            onChange={(value) => setDraft((d) => ({ ...d, digest: value }))}
            label={tm.digest}
            desc={tm.digestDesc}
          />
          <TmSwitch
            id="tm-alerts"
            checked={draft.alerts}
            onChange={(value) => setDraft((d) => ({ ...d, alerts: value }))}
            label={tm.alerts}
            desc={tm.alertsDesc}
          />
        </div>

        <div className="tm-form-footer">
          {dirty && <span className="tm-dirty">{tm.unsaved}</span>}
          <div className="tm-btn-row">
            <button type="button" className="tm-btn" onClick={handleDiscard} disabled={!dirty || saving}>
              {tm.discard}
            </button>
            <button type="submit" className="tm-btn tm-btn-primary" disabled={!dirty || saving}>
              {saving ? tm.saving : tm.save}
            </button>
          </div>
        </div>
      </form>

      <section className="tm-card" aria-labelledby="tm-members-title">
        <div className="tm-card-head">
          <div className="tm-card-title">
            <span className="tm-card-icon"><TmIcon name="users" size={20} /></span>
            <div>
              <h2 id="tm-members-title">
                {tm.membersTitle} <span className="tm-count">{members.length}</span>
              </h2>
              <p>{tm.membersDesc}</p>
            </div>
          </div>
          <button ref={inviteBtnRef} type="button" className="tm-btn tm-btn-primary tm-invite-btn" onClick={openInvite}>
            <TmIcon name="plus" size={16} stroke={2.4} />
            {tm.inviteButton}
          </button>
        </div>

        <div className="tm-search">
          <TmIcon name="search" size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tm.search}
            aria-label={tm.search}
          />
        </div>

        <div className="tm-table" role="table" aria-label={tm.membersTitle}>
          <div className="tm-thead" role="row">
            <span role="columnheader">{tm.colMember}</span>
            <span role="columnheader">{tm.colEmail}</span>
            <span role="columnheader">{tm.colRole}</span>
            <span role="columnheader">{tm.colStatus}</span>
            <span role="columnheader" />
          </div>

          {filtered.length === 0 ? (
            <p className="tm-empty">{tm.empty}</p>
          ) : (
            filtered.map((m) => (
              <div key={m.id} className={`tm-row ${menuId === m.id ? 'menu-open' : ''}`} role="row">
                <div className="tm-c-member" role="cell">
                  <span className="tm-avatar">{tmInitials(m.name)}</span>
                  <div className="tm-name">
                    <strong title={m.name}>{m.name}</strong>
                    {m.owner && <em className="tm-tag">{tm.owner}</em>}
                    {m.you && !m.owner && <em className="tm-tag">{tm.you}</em>}
                  </div>
                </div>
                <div className="tm-c-email" role="cell" title={m.email}>{m.email}</div>
                <div className="tm-c-role" role="cell">
                  <span className={`tm-badge ${m.role}`}>{tm.roles[m.role]}</span>
                </div>
                <div className="tm-c-status" role="cell">
                  <span className={`tm-status ${m.status}`}><i />{tm.status[m.status]}</span>
                </div>
                <div className="tm-c-menu" role="cell" data-tm-menu>
                  <button
                    type="button"
                    className="tm-dots"
                    aria-label={`${tm.actions}: ${m.name}`}
                    aria-haspopup="menu"
                    aria-expanded={menuId === m.id}
                    onClick={() => setMenuId(menuId === m.id ? null : m.id)}
                  >
                    <TmIcon name="dots" size={18} stroke={2.8} />
                  </button>
                  {menuId === m.id && (
                    <div className="tm-menu" role="menu">
                      <p className="tm-menu-label">{tm.changeRole}</p>
                      {TM_ROLES.map((r) => (
                        <button
                          key={r}
                          type="button"
                          role="menuitemradio"
                          aria-checked={m.role === r}
                          disabled={m.owner}
                          className={m.role === r ? 'active' : ''}
                          onClick={() => changeRole(m.id, r)}
                        >
                          <span>{tm.roles[r]}</span>
                          {m.role === r && <TmIcon name="check" size={15} />}
                        </button>
                      ))}
                      <div className="tm-menu-sep" />
                      {m.status === 'pending' && (
                        <button type="button" role="menuitem" onClick={resendInvite}>{tm.resendInvite}</button>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        className="danger"
                        disabled={m.owner}
                        onClick={() => removeMember(m.id)}
                      >
                        {m.status === 'pending' ? tm.revoke : tm.remove}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {inviteOpen && (
        <div
          className="tm-overlay"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) closeInvite();
          }}
        >
          <div className="tm-modal" role="dialog" aria-modal="true" aria-labelledby="tm-invite-title">
            <div className="tm-modal-head">
              <div>
                <h3 id="tm-invite-title">{tm.inviteTitle}</h3>
                <p>{tm.inviteDesc}</p>
              </div>
              <button type="button" className="tm-close" onClick={closeInvite} aria-label={tm.close}>
                <TmIcon name="close" size={18} />
              </button>
            </div>

            <form onSubmit={submitInvite} noValidate>
              <div className="tm-field">
                <label htmlFor="tm-invite-email">{tm.emailLabel}</label>
                <input
                  ref={emailRef}
                  id="tm-invite-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={`tm-input ${inviteError ? 'invalid' : ''}`}
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    if (inviteError) setInviteError('');
                  }}
                  placeholder={tm.emailPlaceholder}
                  aria-invalid={!!inviteError}
                  aria-describedby={inviteError ? 'tm-invite-error' : undefined}
                />
                {inviteError && <span id="tm-invite-error" className="tm-error">{inviteError}</span>}
              </div>

              <fieldset className="tm-roles">
                <legend>{tm.roleLabel}</legend>
                {TM_ROLES.map((r) => (
                  <label key={r} className={`tm-role-card ${inviteRole === r ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="tm-invite-role"
                      value={r}
                      checked={inviteRole === r}
                      onChange={() => setInviteRole(r)}
                      className="tm-sr"
                    />
                    <span className="tm-role-main">
                      <span className={`tm-badge ${r}`}>{tm.roles[r]}</span>
                      <span className="tm-role-desc">{tm.roleDesc[r]}</span>
                    </span>
                    <span className="tm-radio" aria-hidden="true" />
                  </label>
                ))}
              </fieldset>

              <div className="tm-modal-actions">
                <button type="button" className="tm-btn" onClick={closeInvite}>{tm.cancel}</button>
                <button type="submit" className="tm-btn tm-btn-primary">{tm.sendInvite}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={`tm-toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">
        {toast && (
          <>
            <TmIcon name="check" size={16} stroke={2.4} />
            <span>{toast}</span>
          </>
        )}
      </div>
    </div>
  );
}

export default SettingsView;
