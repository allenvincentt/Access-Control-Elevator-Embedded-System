import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1536;
const CHUNK_MARKER = '__chunked__:';

export type SupabaseStorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memoryStore = new Map<string, string>();

const webAdapter: SupabaseStorageAdapter = {
  async getItem(key) {
    try {
      return globalThis.localStorage?.getItem(key) ?? memoryStore.get(key) ?? null;
    } catch {
      return memoryStore.get(key) ?? null;
    }
  },
  async setItem(key, value) {
    memoryStore.set(key, value);
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      return;
    }
  },
  async removeItem(key) {
    memoryStore.delete(key);
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      return;
    }
  },
};

function chunkKey(key: string, index: number) {
  return `${key}_c${index}`;
}

async function clearChunks(key: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, index));
  }
}

const nativeAdapter: SupabaseStorageAdapter = {
  async getItem(key) {
    const head = await SecureStore.getItemAsync(key);
    if (head == null) return null;
    if (!head.startsWith(CHUNK_MARKER)) return head;

    const count = Number.parseInt(head.slice(CHUNK_MARKER.length), 10);
    if (!Number.isFinite(count) || count <= 0) return null;

    const parts: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const part = await SecureStore.getItemAsync(chunkKey(key, index));
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key, value) {
    const previous = await SecureStore.getItemAsync(key);
    if (previous?.startsWith(CHUNK_MARKER)) {
      await clearChunks(key, Number.parseInt(previous.slice(CHUNK_MARKER.length), 10) || 0);
    }

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let index = 0; index < count; index += 1) {
      await SecureStore.setItemAsync(
        chunkKey(key, index),
        value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
      );
    }
    await SecureStore.setItemAsync(key, `${CHUNK_MARKER}${count}`);
  },

  async removeItem(key) {
    const head = await SecureStore.getItemAsync(key);
    if (head?.startsWith(CHUNK_MARKER)) {
      await clearChunks(key, Number.parseInt(head.slice(CHUNK_MARKER.length), 10) || 0);
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const secureStorageAdapter: SupabaseStorageAdapter =
  Platform.OS === 'web' ? webAdapter : nativeAdapter;
