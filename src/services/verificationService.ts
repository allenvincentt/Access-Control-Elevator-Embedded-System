import { AppError, toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type {
  BarcodeVerificationResult,
  FaceVerificationResult,
  FloorAccessResult,
  FloorKey,
} from '@/types/database';

const BARCODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

export function normaliseBarcode(raw: string): string {
  return raw.trim().toUpperCase().slice(0, 64);
}

export function looksLikeCompanyId(raw: string): boolean {
  return BARCODE_PATTERN.test(normaliseBarcode(raw));
}

export async function verifyBarcode(
  raw: string,
  deviceId: string,
): Promise<BarcodeVerificationResult> {
  const code = normaliseBarcode(raw);
  if (code.length === 0) {
    return { ok: false, reason: 'InvalidInput' };
  }

  const { data, error } = await supabase.rpc('verify_company_barcode', {
    p_company_id: code,
    p_device_id: deviceId,
  });
  if (error) throw toAppError(error, 'The barcode could not be checked.');
  if (!data) throw new AppError('NO_RESULT', 'The barcode could not be checked.');

  return data as unknown as BarcodeVerificationResult;
}

export async function verifyFace(
  sessionToken: string,
  embedding: number[],
  quality: number,
  deviceId: string,
): Promise<FaceVerificationResult> {
  if (!/^[0-9a-f]{64}$/.test(sessionToken)) {
    return { ok: false, reason: 'SessionExpired' };
  }
  if (!Array.isArray(embedding) || embedding.some((value) => !Number.isFinite(value))) {
    return { ok: false, reason: 'InvalidInput' };
  }

  const { data, error } = await supabase.rpc('verify_staff_face', {
    p_session_token: sessionToken,
    p_embedding: embedding,
    p_quality: Math.max(0, Math.min(1, quality)),
    p_device_id: deviceId,
  });

  if (error) throw toAppError(error, 'Face verification could not be completed.');
  if (!data) throw new AppError('NO_RESULT', 'Face verification could not be completed.');

  return data as unknown as FaceVerificationResult;
}

export async function commitFloorAccess(
  sessionToken: string,
  floor: FloorKey,
  deviceId: string,
): Promise<FloorAccessResult> {
  if (!/^[0-9a-f]{64}$/.test(sessionToken)) {
    return { ok: false, reason: 'SessionExpired' };
  }

  const { data, error } = await supabase.rpc('commit_floor_access', {
    p_session_token: sessionToken,
    p_floor: floor,
    p_device_id: deviceId,
  });

  if (error) throw toAppError(error, 'The floor could not be unlocked.');
  if (!data) throw new AppError('NO_RESULT', 'The floor could not be unlocked.');

  return data as unknown as FloorAccessResult;
}

export async function cancelVerificationSession(sessionToken: string | null): Promise<void> {
  if (!sessionToken || !/^[0-9a-f]{64}$/.test(sessionToken)) return;
  await supabase.rpc('cancel_verification_session', { p_session_token: sessionToken });
}
