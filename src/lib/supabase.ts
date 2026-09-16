import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';
import { secureStorageAdapter } from '@/lib/secureStorage';
import type { Database } from '@/types/database';

const LEGACY_AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
  db: { schema: 'public' },
  global: {
    headers: { 'x-client-info': 'elevator-system-mobile-app/1.0.0' },
  },
});

void secureStorageAdapter.removeItem(LEGACY_AUTH_STORAGE_KEY).catch(() => undefined);

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
