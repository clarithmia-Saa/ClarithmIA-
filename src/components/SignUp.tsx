import { useEffect, useRef, useState } from 'react';
import type { Language, Translation } from '@/i18n';
import { AuIcon, AuPasswordField, AuthShell, auEmailOk } from '@/components/AuthShell';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

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

type FieldErrors = { name?: string; email?: string; password?: string; terms?: string; general?: string };

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
  const authStrings = t.auth;
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [emailConfirmationRequired, setEmailConfirmationRequired] = useState(false);
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

  async function submit() {
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

    try {
      if (!isSupabaseConfigured()) {
        console.warn('[ClarithmIA Auth]', authStrings.supabaseNotConfigured);
        setLoading(false);
        onSuccess({ name: fullName.trim(), email: email.trim().toLowerCase() });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (error) {
        let msg = authStrings.authErrorGeneric;
        const lower = error.message.toLowerCase();
        if (lower.includes('already registered') || lower.includes('user_already_exists')) {
          msg = authStrings.userAlreadyExists;
        } else if (lower.includes('rate limit') || lower.includes('too many requests')) {
          msg = authStrings.rateLimitExceeded;
        } else if (error.message) {
          msg = error.message;
        }
        setErrors({ general: msg });
        setLoading(false);
        return;
      }

      // If email confirmation is enabled on Supabase, no active session is returned immediately
      if (data?.user && !data.session) {
        setLoading(false);
        setEmailConfirmationRequired(true);
        return;
      }

      setLoading(false);
      onSuccess({
        name: fullName.trim(),
        email: email.trim().toLowerCase(),
      });
    } catch (err: unknown) {
      console.error('[ClarithmIA Auth SignUp Error]', err);
      setErrors({ general: authStrings.authErrorGeneric });
      setLoading(false);
    }
  }

  return (
    <AuthShell t={t} language={language} onLanguageChange={onLanguageChange} onBack={onBack}>
      {emailConfirmationRequired ? (
        <div className="au-view au-sent" role="status" aria-live="polite">
          <span className="au-sent-icon">
            <AuIcon name="mail" size={26} />
          </span>
          <h1>{authStrings.confirmEmailTitle}</h1>
          <p className="au-sub">{authStrings.confirmEmailText.replace('{email}', email.trim())}</p>
          <div className="p-3 my-3 text-xs text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded text-center">
            {authStrings.confirmEmailNotice}
          </div>
          <button type="button" className="ws-btn primary glow au-submit" onClick={onSwitchToSignIn}>
            {authStrings.signUp.signInLink}
          </button>
        </div>
      ) : (
        <div className="au-view">
          {planNotice && <p className="au-notice">{planNotice}</p>}
          {!isSupabaseConfigured() && (
            <p className="text-xs text-amber-400/90 bg-amber-950/40 border border-amber-500/30 rounded px-3 py-2 mb-3">
              {authStrings.supabaseNotConfigured}
            </p>
          )}
          <h1>{a.title}</h1>
          <p className="au-sub">{a.subtitle}</p>

          {errors.general && (
            <div className="text-xs text-rose-300 bg-rose-950/50 border border-rose-500/30 rounded px-3 py-2 mb-4" role="alert">
              {errors.general}
            </div>
          )}

          <form
            className="au-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
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
                  if (errors.general) clear('general');
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
                  if (errors.general) clear('general');
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
                  if (errors.general) clear('general');
                }}
              />
              <div className={`au-strength s${strength}`} aria-live="polite">
                <span className="au-bars" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
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
                <span className="au-box">
                  <AuIcon name="check" size={13} />
                </span>
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
            <button type="button" className="au-link strong" onClick={onSwitchToSignIn}>
              {a.signInLink}
            </button>
          </p>
        </div>
      )}
    </AuthShell>
  );
}

export default SignUp;
