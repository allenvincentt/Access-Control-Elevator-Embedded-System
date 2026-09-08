import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'elevator.device_id';

let cached: Promise<string> | null = null;

async function resolveDeviceId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(STORAGE_KEY);
    if (existing && /^[0-9a-fA-F-]{16,64}$/.test(existing)) {
      return existing;
    }
    const next = Crypto.randomUUID();
    await SecureStore.setItemAsync(STORAGE_KEY, next);
    return next;
  } catch {
    return Crypto.randomUUID();
  }
}

export function getDeviceId(): Promise<string> {
  if (!cached) {
    cached = resolveDeviceId();
  }
  return cached;
}
