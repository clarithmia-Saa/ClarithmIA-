import { useEffect, useRef, useState } from 'react';
import type { Translation } from '@/i18n';
import { Icon } from '@/components/icons';
import { PLATFORM_ICONS, platformDesc, platformLabel, type PlatformId } from '@/components/platforms';

type FieldId = keyof Translation['integrations']['fields'];
type FieldKind = 'text' | 'secret' | 'textarea';
type FieldDef = { id: FieldId; kind: FieldKind; suffix?: string };
type Phase = 'form' | 'testing' | 'success';

const IM_SCHEMAS: Record<PlatformId, FieldDef[]> = {
  support: [
    { id: 'subdomain', kind: 'text', suffix: '.zendesk.com' },
    { id: 'email', kind: 'text' },
    { id: 'apiToken', kind: 'secret' },
  ],
  appstore: [
    { id: 'issuerId', kind: 'text' },
    { id: 'keyId', kind: 'text' },
    { id: 'appId', kind: 'text' },
    { id: 'privateKey', kind: 'textarea' },
  ],
  playstore: [
    { id: 'packageName', kind: 'text' },
    { id: 'serviceAccount', kind: 'textarea' },
  ],
  x: [
    { id: 'apiKey', kind: 'secret' },
    { id: 'apiSecret', kind: 'secret' },
    { id: 'bearerToken', kind: 'secret' },
  ],
  instagram: [
    { id: 'accountId', kind: 'text' },
    { id: 'accessToken', kind: 'secret' },
  ],
  tiktok: [
    { id: 'clientKey', kind: 'text' },
    { id: 'clientSecret', kind: 'secret' },
  ],
  youtube: [
    { id: 'channelId', kind: 'text' },
    { id: 'apiKey', kind: 'secret' },
  ],
};

const IM_IMPORT_ESTIMATE: Record<PlatformId, number> = {
  support: 2220,
  appstore: 1240,
  playstore: 3180,
  x: 3605,
  instagram: 4823,
  tiktok: 2194,
  youtube: 1472,
};

const IM_MIN_LENGTH_FIELDS: FieldId[] = ['apiToken', 'apiKey', 'apiSecret', 'bearerToken', 'accessToken', 'clientKey', 'clientSecret', 'keyId'];

function imValidate(t: Translation, id: FieldId, value: string): string {
  const im = t.integrations;
  const v = value.trim();
  if (v.length === 0) return im.errRequired;
  if (id === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return im.errEmail;
  if (id === 'subdomain' && !/^[a-z0-9-]+$/i.test(v)) return im.errSubdomain;
  if ((id === 'appId' || id === 'accountId') && !/^\d+$/.test(v)) return im.errDigits;
  if (IM_MIN_LENGTH_FIELDS.includes(id) && v.length < 8) return im.errShort;
  if ((id === 'privateKey' || id === 'serviceAccount') && v.length < 20) return im.errShort;
  return '';
}

function useModalBehavior(onEscape: () => void, active: boolean) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && active) onEscape();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [active, onEscape]);
}

export function SourcePickerModal({
  t,
  connected,
  onClose,
  onSelect,
}: {
  t: Translation;
  connected: Set<PlatformId>;
  onClose: () => void;
  onSelect: (platform: PlatformId) => void;
}) {
  useModalBehavior(onClose, true);
  return (
    <div
      className="im-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="im-dialog" role="dialog" aria-modal="true" aria-labelledby="im-picker-title">
        <div className="im-head">
          <div>
            <h2 id="im-picker-title">{t.sources.modalTitle}</h2>
            <p>{t.sources.modalSubtitle}</p>
          </div>
          <button type="button" className="im-icon-btn" aria-label={t.integrations.cancel} onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="im-options">
          {(t.sources.availableSources as readonly PlatformId[]).map((platform) => {
            const PlatformIcon = PLATFORM_ICONS[platform];
            const isConnected = connected.has(platform);
            return (
              <button
                key={platform}
                type="button"
                className={`im-option ${isConnected ? 'done' : ''}`}
                disabled={isConnected}
                onClick={() => onSelect(platform)}
              >
                <span className={`source-platform-icon ${platform}`}><PlatformIcon size={22} /></span>
                <span className="im-option-text">
                  <strong>{platformLabel(t, platform)}</strong>
                  <small>{platformDesc(t, platform)}</small>
                </span>
                <span className={`im-option-badge ${isConnected ? 'done' : ''}`}>
                  {isConnected ? <><Icon name="check" size={12} /> {t.sources.modalConnected}</> : <><Icon name="plus" size={12} /> {t.sources.connect}</>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ConnectSourceModal({
  t,
  platform,
  mode,
  onClose,
  onConnected,
}: {
  t: Translation;
  platform: PlatformId;
  mode: 'connect' | 'configure';
  onClose: () => void;
  onConnected: (platform: PlatformId) => void;
}) {
  const im = t.integrations;
  const fields = IM_SCHEMAS[platform];
  const name = platformLabel(t, platform);
  const PlatformIcon = PLATFORM_ICONS[platform];

  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<Phase>('form');
  const timer = useRef<number | null>(null);
  const firstField = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useModalBehavior(onClose, phase !== 'testing');

  useEffect(() => {
    const id = window.setTimeout(() => firstField.current?.focus(), 80);
    return () => {
      window.clearTimeout(id);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  function setValue(id: FieldId, value: string) {
    setValues((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors((prev) => ({ ...prev, [id]: '' }));
  }

  function submit() {
    if (phase !== 'form') return;
    const next: Record<string, string> = {};
    fields.forEach((f) => {
      next[f.id] = imValidate(t, f.id, values[f.id] ?? '');
    });
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setPhase('testing');
    timer.current = window.setTimeout(() => {
      setPhase('success');
      onConnected(platform);
    }, 1500);
  }

  const estimate = new Intl.NumberFormat(t.billing.locale).format(IM_IMPORT_ESTIMATE[platform]);

  return (
    <div
      className="im-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && phase !== 'testing') onClose();
      }}
    >
      <div className="im-dialog" role="dialog" aria-modal="true" aria-labelledby="im-connect-title">
        {phase === 'form' && (
          <>
            <div className="im-head">
              <div className="im-head-main">
                <span className={`source-platform-icon ${platform}`}><PlatformIcon size={22} /></span>
                <div>
                  <h2 id="im-connect-title">
                    {(mode === 'configure' ? im.configureTitle : im.connectTitle).replace('{platform}', name)}
                  </h2>
                  <p>{im.connectSubtitle}</p>
                </div>
              </div>
              <button type="button" className="im-icon-btn" aria-label={im.cancel} onClick={onClose}>
                <Icon name="x" size={18} />
              </button>
            </div>

            <p className="im-help"><Icon name="sparkles" size={15} /><span>{im.help[platform]}</span></p>

            <form
              className="im-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              {fields.map((field, i) => {
                const def = im.fields[field.id];
                const inputId = `im-${platform}-${field.id}`;
                const error = errors[field.id];
                const isSecret = field.kind === 'secret';
                const show = revealed[field.id];
                return (
                  <div className="im-field" key={field.id}>
                    <label htmlFor={inputId}>{def.label}</label>
                    {field.kind === 'textarea' ? (
                      <textarea
                        id={inputId}
                        ref={i === 0 ? firstField : undefined}
                        className={`im-input mono ${error ? 'invalid' : ''}`}
                        rows={4}
                        value={values[field.id] ?? ''}
                        placeholder={def.placeholder}
                        spellCheck={false}
                        autoCapitalize="none"
                        aria-invalid={Boolean(error)}
                        onChange={(e) => setValue(field.id, e.target.value)}
                      />
                    ) : (
                      <div className={`im-input-wrap ${error ? 'invalid' : ''}`}>
                        <input
                          id={inputId}
                          ref={i === 0 ? firstField : undefined}
                          className="im-input"
                          type={isSecret && !show ? 'password' : 'text'}
                          value={values[field.id] ?? ''}
                          placeholder={def.placeholder}
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          aria-invalid={Boolean(error)}
                          onChange={(e) => setValue(field.id, e.target.value)}
                        />
                        {field.suffix && <span className="im-suffix">{field.suffix}</span>}
                        {isSecret && (
                          <button
                            type="button"
                            className="im-eye"
                            aria-label={show ? im.hide : im.show}
                            aria-pressed={Boolean(show)}
                            onClick={() => setRevealed((prev) => ({ ...prev, [field.id]: !prev[field.id] }))}
                          >
                            <Icon name={show ? 'eyeOff' : 'eye'} size={17} />
                          </button>
                        )}
                      </div>
                    )}
                    {error && <small className="im-error">{error}</small>}
                  </div>
                );
              })}

              <p className="im-secure"><Icon name="lock" size={14} /> {im.secureNote}</p>

              <div className="im-actions">
                <button type="button" className="im-btn ghost" onClick={onClose}>{im.cancel}</button>
                <button type="submit" className="im-btn primary">
                  <Icon name="plugZap" size={16} />
                  {mode === 'configure' ? im.save : im.connect}
                </button>
              </div>
            </form>
          </>
        )}

        {phase === 'testing' && (
          <div className="im-state" role="status" aria-live="polite">
            <span className="im-spinner" aria-hidden="true" />
            <h2>{im.testing}</h2>
            <p>{im.testingSub.replace('{platform}', name)}</p>
          </div>
        )}

        {phase === 'success' && (
          <div className="im-state success" role="status" aria-live="polite">
            <span className="im-success-icon"><Icon name="check" size={30} /></span>
            <h2>{im.successTitle}</h2>
            <p>{im.successText.replace('{platform}', name)}</p>
            <span className="im-estimate">{im.successImport.replace('{count}', estimate)}</span>
            <button type="button" className="im-btn primary full" onClick={onClose}>{im.done}</button>
          </div>
        )}
      </div>
    </div>
  );
}
