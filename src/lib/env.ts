const PLACEHOLDER_URL = 'https://not-configured.supabase.co';
const PLACEHOLDER_KEY = 'not-configured';

const rawUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const rawKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

function describeProblem(): string | null {
  if (!rawUrl || !rawKey) {
    return 'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. Copy .env.example to .env, fill in your project values, then restart with "npx expo start --clear".';
  }

  const isHosted = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in|red)$/i.test(rawUrl);
  const isLocal = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(rawUrl);
  if (!isHosted && !isLocal) {
    return 'EXPO_PUBLIC_SUPABASE_URL does not look like a Supabase project URL (https://<ref>.supabase.co).';
  }

  if (/service_role/i.test(rawKey)) {
    return 'EXPO_PUBLIC_SUPABASE_ANON_KEY looks like a service role key. That key must never be bundled into a mobile app.';
  }

  if (!/^eyJ/.test(rawKey) && !/^sb_publishable_/.test(rawKey)) {
    return 'EXPO_PUBLIC_SUPABASE_ANON_KEY should be the anon (legacy JWT) or publishable key from Settings -> API Keys.';
  }

  return null;
}

export const SUPABASE_CONFIG_ERROR = describeProblem();
export const IS_SUPABASE_CONFIGURED = SUPABASE_CONFIG_ERROR === null;

export const SUPABASE_URL = IS_SUPABASE_CONFIGURED ? rawUrl : PLACEHOLDER_URL;
export const SUPABASE_ANON_KEY = IS_SUPABASE_CONFIGURED ? rawKey : PLACEHOLDER_KEY;

const rawElevatorUrl = (process.env.EXPO_PUBLIC_ELEVATOR_URL ?? '').trim();
const rawElevatorKey = (process.env.EXPO_PUBLIC_ELEVATOR_KEY ?? '').trim();

export const ELEVATOR_BASE_URL = rawElevatorUrl.replace(/\/+$/, '');
export const ELEVATOR_DEVICE_KEY = rawElevatorKey;
export const IS_ELEVATOR_CONFIGURED =
  ELEVATOR_BASE_URL.length > 0 && ELEVATOR_DEVICE_KEY.length > 0;
export const ELEVATOR_CONFIG_ERROR = IS_ELEVATOR_CONFIGURED
  ? null
  : 'EXPO_PUBLIC_ELEVATOR_URL and EXPO_PUBLIC_ELEVATOR_KEY are not set. Set the URL to http://192.168.4.1, then restart with "npx expo start --clear".';
