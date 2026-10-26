import type { ReactNode } from 'react';
import { useState } from 'react';
import type { Language, Translation } from '@/i18n';

type AuIconName = 'eye' | 'eyeOff' | 'arrowLeft' | 'check' | 'mail';

const AU_ICONS: Record<AuIconName, ReactNode> = {
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="m2 2 20 20" />
    </>
  ),
  arrowLeft: <path d="m12 19-7-7 7-7M19 12H5" />,
  check: <path d="M20 6 9 17l-5-5" />,
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 7L2 7" />
    </>
  ),
};

export function AuIcon({ name, size = 18 }: { name: AuIconName; size?: number }) {
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
      {AU_ICONS[name]}
    </svg>
  );
}

export function auEmailOk(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function AuthShell({
  t,
  language,
  onLanguageChange,
  onBack,
  children,
}: {
  t: Translation;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="au-shell">
      <header className="au-top">
        <button type="button" className="au-back" onClick={onBack}>
          <AuIcon name="arrowLeft" size={16} />
          {t.auth.backToSite}
        </button>
        <div className="ob-lang" role="group" aria-label="Language">
          {(['en', 'pt'] as Language[]).map((l) => (
            <button
              key={l}
              type="button"
              className={language === l ? 'active' : ''}
              aria-pressed={language === l}
              onClick={() => onLanguageChange(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      <main className="au-main">
        <span className="ob-brand au-brand"><i />ClarithmIA</span>
        <section className="au-card">{children}</section>
      </main>
    </div>
  );
}

export function AuPasswordField({
  t,
  id,
  label,
  value,
  placeholder,
  autoComplete,
  error,
  hint,
  labelAction,
  onChange,
}: {
  t: Translation;
  id: string;
  label: string;
  value: string;
  placeholder: string;
  autoComplete: string;
  error?: string;
  hint?: string;
  labelAction?: ReactNode;
  onChange: (value: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="ws-field">
      <div className="au-label-row">
        <label htmlFor={id}>{label}</label>
        {labelAction}
      </div>
      <div className="au-pass">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          className={`ws-input ${error ? 'invalid' : ''}`}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="au-eye"
          aria-label={show ? t.auth.hidePassword : t.auth.showPassword}
          aria-pressed={show}
          onClick={() => setShow((v) => !v)}
        >
          <AuIcon name={show ? 'eyeOff' : 'eye'} size={18} />
        </button>
      </div>
      {error ? <small className="ws-error">{error}</small> : hint ? <small className="ws-hint">{hint}</small> : null}
    </div>
  );
}
