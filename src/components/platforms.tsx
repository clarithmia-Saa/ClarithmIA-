import type { Translation } from '@/i18n';

export type PlatformId =
  | 'instagram'
  | 'tiktok'
  | 'x'
  | 'youtube'
  | 'support'
  | 'appstore'
  | 'playstore'
  | 'facebook'
  | 'linkedin'
  | 'webhook';
export type StatusId = 'operational' | 'syncing' | 'disconnected' | 'error';

function InstagramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TikTokIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.5 3c.3 2.1 1.7 3.8 3.8 4.1v2.8c-1.3.1-2.6-.2-3.8-.8v5.9c0 3-2.4 5.5-5.4 5.5S5.7 18 5.7 15s2.4-5.5 5.4-5.5c.3 0 .6 0 .9.1v3c-.3-.1-.6-.2-.9-.2-1.4 0-2.5 1.1-2.5 2.6s1.1 2.6 2.5 2.6 2.5-1.1 2.5-2.6V3h2.9z" />
    </svg>
  );
}

function XIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.5 3h3l-7.1 8.1L21.7 21h-6l-4.7-6.1L5.6 21H2.5l7.6-8.7L2.3 3h6.1l4.3 5.6L17.5 3zm-1 16h1.7L7.5 4.7H5.7L16.5 19z" />
    </svg>
  );
}

function YouTubeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23 12s0-3.2-.4-4.7c-.2-.8-.9-1.5-1.7-1.7C19.4 5.2 12 5.2 12 5.2s-7.4 0-8.9.4c-.8.2-1.5.9-1.7 1.7C1 8.8 1 12 1 12s0 3.2.4 4.7c.2.8.9 1.5 1.7 1.7 1.5.4 8.9.4 8.9.4s7.4 0 8.9-.4c.8-.2 1.5-.9 1.7-1.7.4-1.5.4-4.7.4-4.7zM9.8 15.3V8.7l5.7 3.3-5.7 3.3z" />
    </svg>
  );
}

function SupportIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2v3l-4-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      <path d="M8 10h8M8 13h5" />
    </svg>
  );
}

function AppStoreIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function PlayStoreIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3 20 12 6 21z" />
    </svg>
  );
}

function FacebookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function LinkedInIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
    </svg>
  );
}

function WebhookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" />
      <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06l3.19 5.74c.54.99 1.6 1.61 2.73 1.61h.06" />
      <circle cx="20" cy="17" r="2" />
      <circle cx="5" cy="17" r="2" />
      <circle cx="12" cy="5" r="2" />
    </svg>
  );
}

export const PLATFORM_ICONS: Record<PlatformId, (props: { size?: number }) => JSX.Element> = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  x: XIcon,
  youtube: YouTubeIcon,
  support: SupportIcon,
  appstore: AppStoreIcon,
  playstore: PlayStoreIcon,
  facebook: FacebookIcon,
  linkedin: LinkedInIcon,
  webhook: WebhookIcon,
};

export function platformLabel(t: Translation, platform: PlatformId): string {
  const map: Record<PlatformId, string> = {
    instagram: t.sources.platformInstagram,
    tiktok: t.sources.platformTikTok,
    x: t.sources.platformX,
    youtube: t.sources.platformYouTube,
    support: t.sources.platformSupport,
    appstore: t.sources.platformAppStore,
    playstore: t.sources.platformPlayStore,
    facebook: t.sources.platformFacebook,
    linkedin: t.sources.platformLinkedIn,
    webhook: t.sources.platformWebhook,
  };
  return map[platform];
}

export function platformDesc(t: Translation, platform: PlatformId): string {
  const map: Record<PlatformId, string> = {
    instagram: t.sources.platformInstagramDesc,
    tiktok: t.sources.platformTikTokDesc,
    x: t.sources.platformXDesc,
    youtube: t.sources.platformYouTubeDesc,
    support: t.sources.platformSupportDesc,
    appstore: t.sources.platformAppStoreDesc,
    playstore: t.sources.platformPlayStoreDesc,
    facebook: t.sources.platformFacebookDesc,
    linkedin: t.sources.platformLinkedInDesc,
    webhook: t.sources.platformWebhookDesc,
  };
  return map[platform];
}

export function statusLabel(t: Translation, status: StatusId): string {
  const map: Record<StatusId, string> = {
    operational: t.sources.statusOperational,
    syncing: t.sources.statusSyncing,
    disconnected: t.sources.statusDisconnected,
    error: t.sources.statusError,
  };
  return map[status];
}
