import { useEffect, useRef, useState } from 'react';
import type { Language, Translation } from '@/i18n';
import { AuIcon, AuPasswordField, AuthShell, auEmailOk } from '@/components/AuthShell';

type Mode = 'signin' | 'reset' | 'sent';

function SignIn({
  t,
  language,
  onLanguageChange,
  onBack,
  onSuccess,
  onSwitchToSignUp,
  planNotice,
}: {
  t: Translation;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onBack: () => void;
  onSuccess: (email: string) => void;
  onSwitchToSignUp: () => void;
  planNotice?: string;
}) {
  const a = t.auth;
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  function submitSignIn() {
    if (loading) return;
    const next: { email?: string; password?: string } = {};
    if (!auEmailOk(email)) next.email = a.signIn.errEmail;
    if (password.length === 0) next.password = a.signIn.errPassword;
    setErrors(next);
    if (next.email || next.password) return;
    setLoading(true);
    timer.current = window.setTimeout(() => onSuccess(email.trim().toLowerCase()), 900);
  }

  function submitReset() {
    if (loading) return;
    if (!auEmailOk(email)) {
      setErrors({ email: a.signIn.errEmail });
      return;
    }
    setErrors({});
    setLoading(true);
    timer.current = window.setTimeout(() => {
      setLoading(false);
      setMode('sent');
    }, 800);
  }

  function resend() {
    setResent(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setResent(false), 3000);
  }

  function openReset() {
    setErrors({});
    setMode('reset');
  }

  function backToSignIn() {
    setErrors({});
    setResent(false);
    setLoading(false);
    setMode('signin');
  }

  return (
    <AuthShell t={t} language={language} onLanguageChange={onLanguageChange} onBack={onBack}>
      {mode === 'signin' && (
        <div className="au-view">
          {planNotice && <p className="au-notice">{planNotice}</p>}
          <h1>{a.signIn.title}</h1>
          <p className="au-sub">{a.signIn.subtitle}</p>
          <form
            className="au-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submitSignIn();
            }}
          >
            <div className="ws-field">
              <label htmlFor="au-email">{a.signIn.email}</label>
              <input
                id="au-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                className={`ws-input ${errors.email ? 'invalid' : ''}`}
                value={email}
                placeholder={a.signIn.emailPlaceholder}
                aria-invalid={Boolean(errors.email)}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                }}
              />
              {errors.email && <small className="ws-error">{errors.email}</small>}
            </div>

            <AuPasswordField
              t={t}
              id="au-password"
              label={a.signIn.password}
              value={password}
              placeholder={a.signIn.passwordPlaceholder}
              autoComplete="current-password"
              error={errors.password}
              labelAction={
                <button type="button" className="au-link" onClick={openReset}>{a.signIn.forgot}</button>
              }
              onChange={(value) => {
                setPassword(value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
            />

            <button type="submit" className="ws-btn primary glow au-submit" disabled={loading}>
              {loading && <i className="au-spin" aria-hidden="true" />}
              {loading ? a.signIn.submitting : a.signIn.submit}
            </button>
          </form>
          <p className="au-switch">
            {a.signIn.noAccount}{' '}
            <button type="button" className="au-link strong" onClick={onSwitchToSignUp}>{a.signIn.createAccount}</button>
          </p>
        </div>
      )}

      {mode === 'reset' && (
        <div className="au-view">
          <h1>{a.reset.title}</h1>
          <p className="au-sub">{a.reset.subtitle}</p>
          <form
            className="au-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submitReset();
            }}
          >
            <div className="ws-field">
              <label htmlFor="au-reset-email">{a.signIn.email}</label>
              <input
                id="au-reset-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                className={`ws-input ${errors.email ? 'invalid' : ''}`}
                value={email}
                placeholder={a.signIn.emailPlaceholder}
                aria-invalid={Boolean(errors.email)}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors({});
                }}
              />
              {errors.email && <small className="ws-error">{errors.email}</small>}
            </div>
            <button type="submit" className="ws-btn primary glow au-submit" disabled={loading}>
              {loading && <i className="au-spin" aria-hidden="true" />}
              {loading ? a.reset.submitting : a.reset.submit}
            </button>
          </form>
          <p className="au-switch">
            <button type="button" className="au-link strong" onClick={backToSignIn}>{a.reset.back}</button>
          </p>
        </div>
      )}

      {mode === 'sent' && (
        <div className="au-view au-sent" role="status" aria-live="polite">
          <span className="au-sent-icon"><AuIcon name="mail" size={26} /></span>
          <h1>{a.reset.sentTitle}</h1>
          <p className="au-sub">{a.reset.sentText.replace('{email}', email.trim())}</p>
          <button type="button" className="ws-btn outline au-submit" onClick={resend}>{a.reset.resend}</button>
          {resent && <p className="au-note">{a.reset.resent}</p>}
          <p className="au-switch">
            <button type="button" className="au-link strong" onClick={backToSignIn}>{a.reset.back}</button>
          </p>
        </div>
      )}
    </AuthShell>
  );
}

export default SignIn;
