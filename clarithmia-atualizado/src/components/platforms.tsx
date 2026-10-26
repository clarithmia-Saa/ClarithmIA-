import type { Translation } from '@/i18n';

export type PlatformId = 'instagram' | 'tiktok' | 'x' | 'youtube' | 'support' | 'appstore' | 'playstore';
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

export const PLATFORM_ICONS: Record<PlatformId, (props: { size?: number }) => JSX.Element> = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  x: XIcon,
  youtube: YouTubeIcon,
  support: SupportIcon,
  appstore: AppStoreIcon,
  playstore: PlayStoreIcon,
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
