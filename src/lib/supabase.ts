import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes('your-project') &&
      !supabaseAnonKey.includes('your-anon-key')
  );
};

// Fallback dummy URL and key to prevent createClient from throwing at module initialization time
// when environment variables are not yet populated in a development or preview environment.
const fallbackUrl = 'https://placeholder-project.supabase.co';
const fallbackKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder';

export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured() ? (supabaseUrl as string) : fallbackUrl,
  isSupabaseConfigured() ? (supabaseAnonKey as string) : fallbackKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'clarithmia_supabase_auth_token',
    },
  }
);

/**
 * Returns only a real Supabase access token. Demo/fallback credentials are
 * deliberately not generated: the backend must reject unauthenticated calls.
 */
export async function getAuthToken(): Promise<string> {
  if (!isSupabaseConfigured()) return '';
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('[ClarithmIA Auth] Error obtaining session token:', error.message);
      return '';
    }
    return data?.session?.access_token ?? '';
  } catch (err) {
    console.warn('[ClarithmIA Auth] Error obtaining session token:', err);
    return '';
  }
}

export type { Session };
