import { useEffect, useRef, useState } from 'react';
import type { Translation } from '@/i18n';
import { Icon } from '@/components/icons';
import { PLATFORM_ICONS, platformDesc, platformLabel, type PlatformId } from '@/components/platforms';

type FieldId = keyof Translation['integrations']['fields'];
type FieldKind = 'text' | 'secret' | 'textarea';
type FieldDef = { id: FieldId; kind: FieldKind; suffix?: string };
type Phase = 'form' | 'testing' | 'success';

type SuccessDetails = {
  accepted?: number;
  persistedTo?: string;
  requestId?: string;
  connector: string;
  timestamp?: string;
};

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
  facebook: [
    { id: 'pageId', kind: 'text' },
    { id: 'accessToken', kind: 'secret' },
  ],
  linkedin: [
    { id: 'organizationId', kind: 'text' },
    { id: 'accessToken', kind: 'secret' },
  ],
  webhook: [
    { id: 'secretKey', kind: 'secret' },
  ],
};

const IM_MIN_LENGTH_FIELDS: FieldId[] = [
  'apiToken',
  'apiKey',
  'apiSecret',
  'bearerToken',
  'accessToken',
  'clientKey',
  'clientSecret',
  'keyId',
  'secretKey',
];

function imValidate(t: Translation, id: FieldId, value: string): string {
  const im = t.integrations;
  const v = value.trim();
  if (v.length === 0) return im.errRequired;
  if (id === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return im.errEmail;
  if (id === 'subdomain' && !/^[a-z0-9-]+$/i.test(v)) return im.errSubdomain;
  if ((id === 'appId' || id === 'accountId' || id === 'pageId') && !/^\d+$/.test(v)) return im.errDigits;
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
  onConnected: (platform: PlatformId, metadata?: { count?: string; lastSync?: string }) => void;
}) {
  const im = t.integrations;
  const fields = IM_SCHEMAS[platform];
  const name = platformLabel(t, platform);
  const PlatformIcon = PLATFORM_ICONS[platform];

  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<Phase>('form');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successDetails, setSuccessDetails] = useState<SuccessDetails | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const firstField = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const webhookEndpointUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/incoming`
    : '/api/webhooks/incoming';

  useModalBehavior(handleCancel, phase !== 'testing');

  useEffect(() => {
    const id = window.setTimeout(() => firstField.current?.focus(), 80);
    return () => {
      window.clearTimeout(id);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  function handleCancel() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onClose();
  }

  function setValue(id: FieldId, value: string) {
    setValues((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors((prev) => ({ ...prev, [id]: '' }));
    if (serverError) setServerError(null);
  }

  async function handleCopyWebhookUrl() {
    try {
      await navigator.clipboard.writeText(webhookEndpointUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Fallback if clipboard API is constrained
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    }
  }

  async function submit() {
    if (submitting || phase !== 'form') return;

    // Validate field formats
    const nextErrors: Record<string, string> = {};
    fields.forEach((f) => {
      nextErrors[f.id] = imValidate(t, f.id, values[f.id] ?? '');
    });
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setServerError(null);
    setSubmitting(true);
    setPhase('testing');

    const ac = new AbortController();
    abortControllerRef.current = ac;

    try {
      if (platform === 'webhook') {
        const token = (values.secretKey ?? '').trim();
        const response = await fetch('/api/webhooks/incoming', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-webhook-token': token,
          },
          body: JSON.stringify({
            text: 'Verificação de conexão ClarithmIA',
            author: { name: 'Sistema de Verificação', handle: 'clarithmia_system' },
            metadata: { test: true, initiatedAt: new Date().toISOString() },
          }),
          signal: ac.signal,
        });

        if (response.status === 200) {
          const data = await response.json();
          setSuccessDetails({
            accepted: data.accepted ?? 1,
            persistedTo: data.persistedTo ?? 'none',
            requestId: data.requestId,
            connector: 'webhook',
            timestamp: new Date().toLocaleTimeString(t.language === 'PT' ? 'pt-BR' : 'en-US'),
          });
          setPhase('success');
          onConnected('webhook', {
            count: String(data.accepted ?? 1),
            lastSync: t.language === 'PT' ? 'agora' : 'just now',
          });
        } else if (response.status === 401) {
          const errData = await response.json().catch(() => null);
          setPhase('form');
          setServerError(errData?.error?.message || im.errInvalidToken);
        } else if (response.status === 500) {
          const errData = await response.json().catch(() => null);
          setPhase('form');
          if (errData?.error?.code === 'CONFIG_MISSING' || errData?.error === 'MISSING_CONFIGURATION') {
            setServerError(im.errMissingServerSecret);
          } else {
            setServerError(
              errData?.error?.message ||
              errData?.message ||
              im.errServerGeneric.replace('{status}', '500').replace('{message}', 'Internal Server Error'),
            );
          }
        } else {
          const errData = await response.json().catch(() => null);
          setPhase('form');
          setServerError(
            errData?.error?.message ||
            errData?.message ||
            im.errServerGeneric.replace('{status}', String(response.status)).replace('{message}', response.statusText || 'Error'),
          );
        }
      } else if (platform === 'x' || platform === 'support') {
        // Connector endpoint verification with dryRun
        const endpoint = platform === 'x' ? '/api/connectors/twitter?dryRun=true' : '/api/connectors/zendesk?dryRun=true';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: ac.signal,
        });

        if (response.status === 200) {
          const data = await response.json();
          setSuccessDetails({
            accepted: data.synced ?? 0,
            persistedTo: data.persistedTo ?? 'none',
            requestId: data.requestId,
            connector: platform,
          });
          setPhase('success');
          onConnected(platform, {
            count: String(data.synced ?? 0),
            lastSync: t.language === 'PT' ? 'agora' : 'just now',
          });
        } else {
          const errData = await response.json().catch(() => null);
          setPhase('form');
          const errMsg = errData?.error?.message || errData?.message || '';
          const errCode = errData?.error?.code || errData?.error || '';
          if (
            errCode === 'CONFIG_MISSING' ||
            errCode === 'MISSING_CONFIGURATION' ||
            errMsg.includes('TWITTER_BEARER_TOKEN') ||
            errMsg.includes('ZENDESK_ACCESS_TOKEN') ||
            errMsg.includes('INTERNAL_API_KEY')
          ) {
            const envVar = platform === 'x' ? 'TWITTER_BEARER_TOKEN' : 'ZENDESK_ACCESS_TOKEN';
            setServerError(im.missingServerEnv.replace('{envVar}', envVar));
          } else {
            setServerError(
              errMsg ||
              im.errServerGeneric.replace('{status}', String(response.status)).replace('{message}', response.statusText || 'Error'),
            );
          }
        }
      } else {
        // External social / app store providers requiring developer portal credentials
        setPhase('form');
        setServerError(im.externalProviderNoticeDesc);
      }
    } catch (err: unknown) {
      if (ac.signal.aborted) {
        setPhase('form');
        setServerError(im.errNetworkOrAborted);
      } else {
        setPhase('form');
        const msg = err instanceof Error ? err.message : String(err);
        setServerError(im.errServerGeneric.replace('{status}', 'Network').replace('{message}', msg));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isExternalPending = platform !== 'webhook' && platform !== 'x' && platform !== 'support';

  return (
    <div
      className="im-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && phase !== 'testing') handleCancel();
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
              <button type="button" className="im-icon-btn" aria-label={im.cancel} onClick={handleCancel}>
                <Icon name="x" size={18} />
              </button>
            </div>

            {/* Help / Guidance Box */}
            <p className="im-help"><Icon name="sparkles" size={15} /><span>{im.help[platform]}</span></p>

            {/* Webhook Endpoint Display and Copy Box */}
            {platform === 'webhook' && (
              <div className="im-endpoint-box" style={{ marginBottom: 16 }}>
                <label>{im.endpointLabel}</label>
                <div className="im-endpoint-row">
                  <span className="im-endpoint-code">{webhookEndpointUrl}</span>
                  <button
                    type="button"
                    className="im-copy-btn"
                    onClick={handleCopyWebhookUrl}
                    title={im.copyEndpoint}
                  >
                    <Icon name={copiedUrl ? 'check' : 'copy'} size={14} />
                    <span>{copiedUrl ? im.copiedEndpoint : im.copyEndpoint}</span>
                  </button>
                </div>
                <small style={{ color: '#94a3b8', fontSize: '11.5px', lineHeight: 1.45 }}>
                  {im.webhookNotice}
                </small>
              </div>
            )}

            {/* External Platform Prerequisite Notice */}
            {isExternalPending && (
              <div className="im-alert-notice" style={{ marginBottom: 16 }}>
                <Icon name="alert" size={16} />
                <div>
                  <strong style={{ display: 'block', marginBottom: 2 }}>{im.externalProviderNoticeTitle}</strong>
                  <span>{im.externalProviderNoticeDesc}</span>
                </div>
              </div>
            )}

            {/* Server Error Alert */}
            {serverError && (
              <div className="im-alert-error" role="alert" style={{ marginBottom: 16 }}>
                <Icon name="x" size={16} />
                <span>{serverError}</span>
              </div>
            )}

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
                <button type="button" className="im-btn ghost" onClick={handleCancel}>
                  {im.cancel}
                </button>
                <button type="submit" className="im-btn primary" disabled={submitting}>
                  <Icon name="plugZap" size={16} />
                  {platform === 'webhook'
                    ? im.testEventText
                    : mode === 'configure'
                    ? im.save
                    : im.connect}
                </button>
              </div>
            </form>
          </>
        )}

        {phase === 'testing' && (
          <div className="im-state" role="status" aria-live="polite">
            <span className="im-spinner" aria-hidden="true" />
            <h2>{platform === 'webhook' ? im.testingWebhook : im.testing}</h2>
            <p>{im.testingSub.replace('{platform}', name)}</p>
            <div style={{ marginTop: 20 }}>
              <button
                type="button"
                className="im-btn ghost"
                onClick={handleCancel}
              >
                {im.cancel}
              </button>
            </div>
          </div>
        )}

        {phase === 'success' && (
          <div className="im-state success" role="status" aria-live="polite">
            <span className="im-success-icon"><Icon name="check" size={30} /></span>
            <h2>{im.successTitle}</h2>
            <p>{platform === 'webhook' ? im.successWebhook : im.successText.replace('{platform}', name)}</p>

            {/* Real Server Response Metadata */}
            {successDetails && (
              <div className="im-server-meta">
                {successDetails.accepted !== undefined && (
                  <div className="im-server-meta-row">
                    <span>{im.serverEventsAccepted}</span>
                    <strong>{successDetails.accepted}</strong>
                  </div>
                )}
                <div className="im-server-meta-row">
                  <span>{im.serverPersisted}</span>
                  <strong>
                    {successDetails.persistedTo === 'supabase'
                      ? im.serverPersistedDb
                      : im.serverPersistedNone}
                  </strong>
                </div>
                {successDetails.requestId && (
                  <div className="im-server-meta-row">
                    <span>{im.serverRequestId}</span>
                    <span>{successDetails.requestId}</span>
                  </div>
                )}
              </div>
            )}

            <button type="button" className="im-btn primary full" onClick={onClose}>
              {im.done}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
