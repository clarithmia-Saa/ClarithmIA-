import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Language, Translation } from '@/i18n';

type ChannelId = 'appstore' | 'playstore' | 'zendesk' | 'x' | 'instagram' | 'youtube';
type ObIconName = ChannelId | 'check';

export type OnboardingResult = {
  name: string;
  slug: string;
  channels: ChannelId[];
  alerts: boolean;
  digest: boolean;
  autoTag: boolean;
};

const OB_CHANNELS: ChannelId[] = ['appstore', 'playstore', 'zendesk', 'x', 'instagram', 'youtube'];
const OB_STEP_KEYS = ['profile', 'channels', 'ai'] as const;
const OB_TOTAL = OB_STEP_KEYS.length;

const OB_ICONS: Record<ObIconName, ReactNode> = {
  check: <path d="M20 6 9 17l-5-5" />,
  appstore: (
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </>
  ),
  playstore: <path d="M6 3 20 12 6 21z" />,
  zendesk: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <path d="m4.93 4.93 4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24" />
    </>
  ),
  x: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </>
  ),
  instagram: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5h.01" />
    </>
  ),
  youtube: (
    <>
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </>
  ),
};

function ObIcon({ name, size = 20 }: { name: ObIconName; size?: number }) {
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
      {OB_ICONS[name]}
    </svg>
  );
}

function obSlugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function obSanitizeSlug(value: string) {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 32);
}

function ObToggle({
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
    <div className="ws-toggle-row ob-toggle">
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

function OnboardingWizard({
  t,
  language,
  onLanguageChange,
  onComplete,
  onSkip,
  defaultName,
}: {
  t: Translation;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onComplete: (result: OnboardingResult) => void;
  onSkip: () => void;
  defaultName?: string;
}) {
  const o = t.onboarding;

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<'forward' | 'back'>('forward');
  const [name, setName] = useState(defaultName ?? '');
  const [slug, setSlug] = useState(obSlugify(defaultName ?? ''));
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<{ name: boolean; slug: boolean }>({ name: false, slug: false });
  const [channels, setChannels] = useState<ChannelId[]>([]);
  const [alerts, setAlerts] = useState(true);
  const [digest, setDigest] = useState(true);
  const [autoTag, setAutoTag] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [doneTasks, setDoneTasks] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step, finishing]);

  function changeName(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(obSlugify(value));
      setErrors((prev) => ({ ...prev, slug: false }));
    }
    if (errors.name) setErrors((prev) => ({ ...prev, name: false }));
  }

  function changeSlug(value: string) {
    setSlugTouched(true);
    setSlug(obSanitizeSlug(value));
    if (errors.slug) setErrors((prev) => ({ ...prev, slug: false }));
  }

  function toggleChannel(id: ChannelId) {
    setChannels((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function goBack() {
    if (step === 0 || finishing) return;
    setDir('back');
    setStep(step - 1);
  }

  function finish() {
    const result: OnboardingResult = { name: name.trim(), slug, channels, alerts, digest, autoTag };
    setFinishing(true);
    setDoneTasks(0);
    const interval = 750;
    for (let i = 1; i <= 4; i += 1) {
      timers.current.push(window.setTimeout(() => setDoneTasks(i), interval * i));
    }
    timers.current.push(window.setTimeout(() => onComplete(result), interval * 4 + 500));
  }

  function goNext() {
    if (finishing) return;
    if (step === 0) {
      const nameInvalid = name.trim().length < 2;
      const slugInvalid = !/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(slug);
      setErrors({ name: nameInvalid, slug: slugInvalid });
      if (nameInvalid || slugInvalid) return;
    }
    if (step < OB_TOTAL - 1) {
      setDir('forward');
      setStep(step + 1);
      return;
    }
    finish();
  }

  const isLast = step === OB_TOTAL - 1;
  const selectedLabel = channels.length === 0 ? o.channels.none : o.channels.selected.replace('{count}', String(channels.length));
  const channelNames = channels.map((id) => o.channels.items[id].name).join(', ');

  const tasks = [
    o.finishing.taskWorkspace,
    channels.length > 0 ? o.finishing.taskChannels.replace('{count}', String(channels.length)) : o.finishing.taskChannelsNone,
    o.finishing.taskAi,
    o.finishing.taskDashboard,
  ];

  return (
    <div className="ob-shell">
      <header className="ob-top">
        <span className="ob-brand"><i />ClarithmIA</span>
        <div className="ob-top-right">
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
          {!finishing && (
            <button type="button" className="ob-skip" onClick={onSkip}>{o.skip}</button>
          )}
        </div>
      </header>

      <main className="ob-main">
        {!finishing && (
          <nav className="ob-progress" aria-label={o.stepOf.replace('{current}', String(step + 1)).replace('{total}', String(OB_TOTAL))}>
            <p className="ob-stepof">{o.stepOf.replace('{current}', String(step + 1)).replace('{total}', String(OB_TOTAL))}</p>
            <ol className="ob-steps">
              {OB_STEP_KEYS.map((key, i) => (
                <li
                  key={key}
                  className={`${i < step ? 'done' : ''} ${i === step ? 'current' : ''}`}
                  aria-current={i === step ? 'step' : undefined}
                >
                  <span className="ob-dot">{i < step ? <ObIcon name="check" size={14} /> : i + 1}</span>
                  <span className="ob-step-label">{o.steps[key]}</span>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <section className="ob-card">
          {finishing ? (
            <div className="ob-step forward ob-finishing" role="status" aria-live="polite">
              <div className="ob-spinner" aria-hidden="true" />
              <h1>{o.finishing.title}</h1>
              <p className="ob-sub">{o.finishing.subtitle}</p>
              <ul className="ob-tasks">
                {tasks.map((task, i) => (
                  <li key={task} className={i < doneTasks ? 'done' : i === doneTasks ? 'active' : ''}>
                    <span className="ob-task-mark">{i < doneTasks ? <ObIcon name="check" size={13} /> : null}</span>
                    {task}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className={`ob-step ${dir}`} key={step}>
              {step === 0 && (
                <>
                  <h1>{o.profile.title}</h1>
                  <p className="ob-sub">{o.profile.subtitle}</p>
                  <form
                    className="ob-fields"
                    noValidate
                    onSubmit={(e) => {
                      e.preventDefault();
                      goNext();
                    }}
                  >
                    <div className="ws-field">
                      <label htmlFor="ob-name">{o.profile.companyName}</label>
                      <input
                        id="ob-name"
                        className={`ws-input ${errors.name ? 'invalid' : ''}`}
                        value={name}
                        maxLength={60}
                        placeholder={o.profile.companyNamePlaceholder}
                        autoComplete="organization"
                        aria-invalid={errors.name}
                        onChange={(e) => changeName(e.target.value)}
                      />
                      {errors.name && <small className="ws-error">{o.profile.errName}</small>}
                    </div>
                    <div className="ws-field">
                      <label htmlFor="ob-slug">{o.profile.slug}</label>
                      <div className={`ws-slug ${errors.slug ? 'invalid' : ''}`}>
                        <span>clarithmia.app/</span>
                        <input
                          id="ob-slug"
                          value={slug}
                          maxLength={32}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          aria-invalid={errors.slug}
                          onChange={(e) => changeSlug(e.target.value)}
                        />
                      </div>
                      {errors.slug ? <small className="ws-error">{o.profile.errSlug}</small> : <small className="ws-hint">{o.profile.slugHint}</small>}
                    </div>
                    <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
                  </form>
                </>
              )}

              {step === 1 && (
                <>
                  <h1>{o.channels.title}</h1>
                  <p className="ob-sub">{o.channels.subtitle}</p>
                  <div className="ob-channels" role="group" aria-label={o.channels.title}>
                    {OB_CHANNELS.map((id) => {
                      const on = channels.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          className={`ob-channel ${on ? 'selected' : ''}`}
                          onClick={() => toggleChannel(id)}
                        >
                          <span className="ob-channel-icon"><ObIcon name={id} size={20} /></span>
                          <strong>{o.channels.items[id].name}</strong>
                          <small>{o.channels.items[id].desc}</small>
                          <span className="ob-channel-check" aria-hidden="true"><ObIcon name="check" size={12} /></span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="ob-count" aria-live="polite">
                    <b>{selectedLabel}</b>
                    <span>{o.channels.hint}</span>
                  </p>
                </>
              )}

              {step === 2 && (
                <>
                  <h1>{o.ai.title}</h1>
                  <p className="ob-sub">{o.ai.subtitle}</p>
                  <div className="ob-toggles">
                    <ObToggle checked={alerts} onChange={setAlerts} label={o.ai.alerts} description={o.ai.alertsDesc} />
                    <ObToggle checked={digest} onChange={setDigest} label={o.ai.digest} description={o.ai.digestDesc} />
                    <ObToggle checked={autoTag} onChange={setAutoTag} label={o.ai.autoTag} description={o.ai.autoTagDesc} />
                  </div>
                  <dl className="ob-recap">
                    <h2>{o.ai.recapTitle}</h2>
                    <div><dt>{o.ai.recapCompany}</dt><dd>{name.trim()} <em>clarithmia.app/{slug}</em></dd></div>
                    <div><dt>{o.ai.recapChannels}</dt><dd>{channelNames || o.ai.recapNone}</dd></div>
                  </dl>
                </>
              )}
            </div>
          )}

          {!finishing && (
            <div className="ob-actions">
              {step > 0 && (
                <button type="button" className="ws-btn ghost ob-back" onClick={goBack}>{o.back}</button>
              )}
              <button type="button" className="ws-btn primary glow ob-next" onClick={goNext}>
                {isLast ? o.finish : o.continue}
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default OnboardingWizard;
