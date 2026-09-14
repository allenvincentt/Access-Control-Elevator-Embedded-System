import { decode as decodeBase64 } from 'base64-arraybuffer';
import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { AppError, toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

const BUCKET = 'staff-photos';
const MAX_EDGE = 512;
const SIGNED_URL_TTL_SECONDS = 3600;

export async function prepareStaffPhoto(localUri: string): Promise<string> {
  const context = ImageManipulator.manipulate(localUri);
  context.resize({ width: MAX_EDGE });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.85,
    base64: true,
  });

  if (!saved.base64) {
    throw new AppError('PHOTO_ENCODE_FAILED', 'That image could not be processed.');
  }
  return saved.base64;
}

export async function uploadStaffPhoto(staffId: string, base64Jpeg: string): Promise<string> {
  const bytes = decodeBase64(base64Jpeg);
  if (bytes.byteLength > 5 * 1024 * 1024) {
    throw new AppError('PHOTO_TOO_LARGE', 'That image is larger than 5 MB.');
  }

  const path = `staff/${staffId}/${Crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
  });

  if (error) throw toAppError(error, 'The photo could not be uploaded.');
  return path;
}

export async function uploadGuestCapture(base64Jpeg: string): Promise<string | null> {
  try {
    const bytes = decodeBase64(base64Jpeg);
    if (bytes.byteLength > 5 * 1024 * 1024) return null;

    const path = `guest/${Crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    });

    return error ? null : path;
  } catch {
    return null;
  }
}

export async function removeStaffPhoto(path: string | null | undefined): Promise<void> {
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error && !/not found/i.test(error.message)) {
    throw toAppError(error, 'The photo could not be removed.');
  }
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function signedPhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;

  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;

  signedUrlCache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
  });
  return data.signedUrl;
}

export async function signedPhotoUrls(
  paths: (string | null | undefined)[],
): Promise<Record<string, string>> {
  const unique = Array.from(
    new Set(paths.filter((path): path is string => typeof path === 'string' && path.length > 0)),
  );

  const pending = unique.filter((path) => {
    const cached = signedUrlCache.get(path);
    return !cached || cached.expiresAt <= Date.now() + 60_000;
  });

  if (pending.length > 0) {
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(pending, SIGNED_URL_TTL_SECONDS);

    data?.forEach((entry) => {
      if (entry.path && entry.signedUrl) {
        signedUrlCache.set(entry.path, {
          url: entry.signedUrl,
          expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
        });
      }
    });
  }

  const result: Record<string, string> = {};
  unique.forEach((path) => {
    const cached = signedUrlCache.get(path);
    if (cached) result[path] = cached.url;
  });
  return result;
}

export function invalidateSignedUrl(path: string | null | undefined) {
  if (path) signedUrlCache.delete(path);
}

export async function pickStaffPhotoBase64(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new AppError(
      'PHOTO_PERMISSION_DENIED',
      'Photo library access is required to choose a profile picture.',
    );
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    exif: false,
    selectionLimit: 1,
  });

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return prepareStaffPhoto(result.assets[0].uri);
}
