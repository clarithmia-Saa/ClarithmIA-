import { useEffect, useRef, useState } from 'react';
import type { Language, Translation } from '@/i18n';
import { AuIcon, AuPasswordField, AuthShell, auEmailOk } from '@/components/AuthShell';

export type SignUpResult = { name: string; email: string };

const AU_FREE_DOMAINS = [
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

function auPasswordValid(value: string) {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function auStrength(value: string) {
  if (value.length === 0) return 0;
  let score = 1;
  if (auPasswordValid(value)) score = 2;
  if (auPasswordValid(value) && (value.length >= 12 || /[^A-Za-z0-9]/.test(value))) score = 3;
  return score;
}

type FieldErrors = { name?: string; email?: string; password?: string; terms?: string };

function SignUp({
  t,
  language,
  onLanguageChange,
  onBack,
  onSuccess,
  onSwitchToSignIn,
  planNotice,
}: {
  t: Translation;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onBack: () => void;
  onSuccess: (result: SignUpResult) => void;
  onSwitchToSignIn: () => void;
  planNotice?: string;
}) {
  const a = t.auth.signUp;
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const strength = auStrength(password);
  const strengthLabel = strength === 1 ? a.strengthWeak : strength === 2 ? a.strengthFair : strength === 3 ? a.strengthStrong : '';

  function clear(key: keyof FieldErrors) {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  function submit() {
    if (loading) return;
    const next: FieldErrors = {};
    if (fullName.trim().length < 2) next.name = a.errName;
    if (!auEmailOk(email)) next.email = a.errEmail;
    else if (AU_FREE_DOMAINS.includes(email.trim().toLowerCase().split('@')[1])) next.email = a.errCorporate;
    if (!auPasswordValid(password)) next.password = a.errPassword;
    if (!accepted) next.terms = a.errTerms;
    setErrors(next);
    if (next.name || next.email || next.password || next.terms) return;
    setLoading(true);
    timer.current = window.setTimeout(
      () => onSuccess({ name: fullName.trim(), email: email.trim().toLowerCase() }),
      1000,
    );
  }

  return (
    <AuthShell t={t} language={language} onLanguageChange={onLanguageChange} onBack={onBack}>
      <div className="au-view">
        {planNotice && <p className="au-notice">{planNotice}</p>}
        <h1>{a.title}</h1>
        <p className="au-sub">{a.subtitle}</p>
        <form
          className="au-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="ws-field">
            <label htmlFor="au-name">{a.fullName}</label>
            <input
              id="au-name"
              autoComplete="name"
              className={`ws-input ${errors.name ? 'invalid' : ''}`}
              value={fullName}
              maxLength={80}
              placeholder={a.fullNamePlaceholder}
              aria-invalid={Boolean(errors.name)}
              onChange={(e) => {
                setFullName(e.target.value);
                clear('name');
              }}
            />
            {errors.name && <small className="ws-error">{errors.name}</small>}
          </div>

          <div className="ws-field">
            <label htmlFor="au-signup-email">{a.email}</label>
            <input
              id="au-signup-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              className={`ws-input ${errors.email ? 'invalid' : ''}`}
              value={email}
              placeholder={a.emailPlaceholder}
              aria-invalid={Boolean(errors.email)}
              onChange={(e) => {
                setEmail(e.target.value);
                clear('email');
              }}
            />
            {errors.email && <small className="ws-error">{errors.email}</small>}
          </div>

          <div className="au-pass-group">
            <AuPasswordField
              t={t}
              id="au-signup-password"
              label={a.password}
              value={password}
              placeholder={a.passwordPlaceholder}
              autoComplete="new-password"
              error={errors.password}
              hint={a.passwordHint}
              onChange={(value) => {
                setPassword(value);
                clear('password');
              }}
            />
            <div className={`au-strength s${strength}`} aria-live="polite">
              <span className="au-bars" aria-hidden="true"><i /><i /><i /></span>
              <b>{strengthLabel}</b>
            </div>
          </div>

          <div className="au-terms-wrap">
            <label className="au-check">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => {
                  setAccepted(e.target.checked);
                  clear('terms');
                }}
              />
              <span className="au-box"><AuIcon name="check" size={13} /></span>
              <span>{a.terms}</span>
            </label>
            {errors.terms && <small className="ws-error">{errors.terms}</small>}
          </div>

          <button type="submit" className="ws-btn primary glow au-submit" disabled={loading}>
            {loading && <i className="au-spin" aria-hidden="true" />}
            {loading ? a.submitting : a.submit}
          </button>
        </form>
        <p className="au-switch">
          {a.hasAccount}{' '}
          <button type="button" className="au-link strong" onClick={onSwitchToSignIn}>{a.signInLink}</button>
        </p>
      </div>
    </AuthShell>
  );
}

export default SignUp;
