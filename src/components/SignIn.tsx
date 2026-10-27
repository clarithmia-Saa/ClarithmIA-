import { useEffect, useRef, useState } from 'react';
import type { Language, Translation } from '@/i18n';
import { AuIcon, AuPasswordField, AuthShell, auEmailOk } from '@/components/AuthShell';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

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
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  async function submitSignIn() {
    if (loading) return;
    const next: { email?: string; password?: string; general?: string } = {};
    if (!auEmailOk(email)) next.email = a.signIn.errEmail;
    if (password.length === 0) next.password = a.signIn.errPassword;
    setErrors(next);
    if (next.email || next.password) return;

    setLoading(true);

    try {
      if (!isSupabaseConfigured()) {
        // Safe development fallback when VITE_SUPABASE_URL is not yet set in environment
        console.warn('[ClarithmIA Auth]', a.supabaseNotConfigured);
        setLoading(false);
        onSuccess(email.trim().toLowerCase());
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        let msg = a.authErrorGeneric;
        const lower = error.message.toLowerCase();
        if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
          msg = a.invalidCredentials;
        } else if (lower.includes('email not confirmed') || lower.includes('not confirmed')) {
          msg = a.emailNotConfirmed;
        } else if (lower.includes('rate limit') || lower.includes('too many requests')) {
          msg = a.rateLimitExceeded;
        } else if (error.message) {
          msg = error.message;
        }
        setErrors({ general: msg });
        setLoading(false);
        return;
      }

      if (data?.user) {
        onSuccess(data.user.email ?? email.trim().toLowerCase());
      }
    } catch (err: unknown) {
      console.error('[ClarithmIA Auth Error]', err);
      setErrors({ general: a.authErrorGeneric });
      setLoading(false);
    }
  }

  async function submitReset() {
    if (loading) return;
    if (!auEmailOk(email)) {
      setErrors({ email: a.signIn.errEmail });
      return;
    }
    setErrors({});
    setLoading(true);

    try {
      if (isSupabaseConfigured()) {
        await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        });
      }
    } catch (err) {
      console.error('[ClarithmIA Auth Reset Error]', err);
    } finally {
      // Per security requirements: always transition to sent view to prevent email enumeration
      setLoading(false);
      setMode('sent');
    }
  }

  async function resend() {
    setResent(true);
    if (timer.current) window.clearTimeout(timer.current);
    try {
      if (isSupabaseConfigured() && auEmailOk(email)) {
        await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        });
      }
    } catch {
      // Ignored for security (do not disclose account existence)
    }
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
          {!isSupabaseConfigured() && (
            <p className="text-xs text-amber-400/90 bg-amber-950/40 border border-amber-500/30 rounded px-3 py-2 mb-3">
              {a.supabaseNotConfigured}
            </p>
          )}
          <h1>{a.signIn.title}</h1>
          <p className="au-sub">{a.signIn.subtitle}</p>

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
              void submitSignIn();
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
                  if (errors.email || errors.general) {
                    setErrors((prev) => ({ ...prev, email: undefined, general: undefined }));
                  }
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
                <button type="button" className="au-link" onClick={openReset}>
                  {a.signIn.forgot}
                </button>
              }
              onChange={(value) => {
                setPassword(value);
                if (errors.password || errors.general) {
                  setErrors((prev) => ({ ...prev, password: undefined, general: undefined }));
                }
              }}
            />

            <button type="submit" className="ws-btn primary glow au-submit" disabled={loading}>
              {loading && <i className="au-spin" aria-hidden="true" />}
              {loading ? a.signIn.submitting : a.signIn.submit}
            </button>
          </form>
          <p className="au-switch">
            {a.signIn.noAccount}{' '}
            <button type="button" className="au-link strong" onClick={onSwitchToSignUp}>
              {a.signIn.createAccount}
            </button>
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
              void submitReset();
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
            <button type="button" className="au-link strong" onClick={backToSignIn}>
              {a.reset.back}
            </button>
          </p>
        </div>
      )}

      {mode === 'sent' && (
        <div className="au-view au-sent" role="status" aria-live="polite">
          <span className="au-sent-icon">
            <AuIcon name="mail" size={26} />
          </span>
          <h1>{a.reset.sentTitle}</h1>
          <p className="au-sub">{a.reset.sentText.replace('{email}', email.trim())}</p>
          <button type="button" className="ws-btn outline au-submit" onClick={() => void resend()}>
            {a.reset.resend}
          </button>
          {resent && <p className="au-note">{a.reset.resent}</p>}
          <p className="au-switch">
            <button type="button" className="au-link strong" onClick={backToSignIn}>
              {a.reset.back}
            </button>
          </p>
        </div>
      )}
    </AuthShell>
  );
}

export default SignIn;
