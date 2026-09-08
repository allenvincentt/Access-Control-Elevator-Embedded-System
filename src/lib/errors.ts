import type { PostgrestError } from '@supabase/supabase-js';

import type { DenialReason } from '@/types/database';

export class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  staff_company_id_key: 'That Company ID is already assigned to another staff member.',
  staff_email_key: 'That Gmail address is already registered.',
  profiles_email_key: 'That email is already registered.',
};

const CODE_MESSAGES: Record<string, string> = {
  NOT_AUTHORIZED: 'Your account does not have permission to do that.',
  NOT_AUTHENTICATED: 'Your session has expired. Sign in again.',
  STAFF_NOT_FOUND: 'That staff record no longer exists.',
  SAMPLES_INVALID: 'The face capture data was malformed. Capture again.',
  SAMPLES_COUNT: 'Between 1 and 5 face captures are required.',
  QUALITY_RANGE: 'The face capture reported an invalid quality score.',
  QUALITY_TOO_LOW: 'The captures were not clear enough. Retake them in better light.',
  CAPTURES_INCONSISTENT:
    'The captures did not look like the same person. Retake them without moving between shots.',
  MODEL_VERSION_INVALID: 'The face recognition model reported an invalid version.',
  EMBEDDING_DIMENSIONS: 'The face model produced an unexpected embedding size.',
  EMBEDDING_NOT_FINITE: 'The face model produced an invalid embedding.',
  EMBEDDING_NOT_NORMALISED: 'The face model produced an invalid embedding.',
};

export const DENIAL_MESSAGES: Record<DenialReason, string> = {
  UnknownCompanyId: 'That barcode is not registered to any staff member.',
  Suspended: 'This staff member is suspended and cannot be granted access.',
  FloorNotAuthorized: 'This staff member is not authorized for this floor.',
  NoFaceEnrolled: 'No face is enrolled for this staff member. Ask an administrator to enrol them.',
  FaceMismatch: 'The face did not match the enrolled profile for this badge.',
  LowQuality: 'The capture was not clear enough to verify. Try again in better light.',
  SessionExpired: 'The barcode step expired. Scan the badge again.',
  TooManyAttempts: 'Too many face attempts for this badge. Scan the badge again.',
  RateLimited: 'Too many failed attempts. Wait a moment before trying again.',
  TerminalNotConfigured: 'This terminal has no floor assigned. Ask an administrator to set one.',
  NotAuthorized: 'This terminal is not permitted to run verification.',
  InvalidInput: 'That code is not a valid staff barcode.',
};

function isPostgrestError(value: unknown): value is PostgrestError {
  return typeof value === 'object' && value !== null && 'message' in value && 'code' in value;
}

export function toAppError(error: unknown, fallback = 'Something went wrong. Try again.'): AppError {
  if (error instanceof AppError) return error;

  if (isPostgrestError(error)) {
    const raw = error.message ?? '';

    const duplicateFace = raw.match(/DUPLICATE_FACE:([^:]*):(.*)$/);
    if (duplicateFace) {
      const [, companyId, fullName] = duplicateFace;
      return new AppError(
        'DUPLICATE_FACE',
        `This face is already enrolled for ${fullName || 'another staff member'} (${companyId}).`,
      );
    }

    for (const [token, message] of Object.entries(CODE_MESSAGES)) {
      if (raw.includes(token)) return new AppError(token, message);
    }

    for (const [constraint, message] of Object.entries(CONSTRAINT_MESSAGES)) {
      if (raw.includes(constraint)) return new AppError(constraint, message);
    }

    if (error.code === '23505') {
      return new AppError('DUPLICATE', 'That value is already in use.');
    }
    if (error.code === '42501' || error.code === 'PGRST301') {
      return new AppError('FORBIDDEN', 'Your account does not have permission to do that.');
    }
    if (error.code === '23514' || error.code === '22023') {
      return new AppError('INVALID', 'Some of the values sent were rejected by the server.');
    }
    if (error.code === 'PGRST116') {
      return new AppError('NOT_FOUND', 'That record could not be found.');
    }
  }

  if (error instanceof Error) {
    if (/network request failed|fetch failed/i.test(error.message)) {
      return new AppError('NETWORK', 'No connection to the server. Check your network and retry.');
    }
    if (error.name === 'AuthRetryableFetchError') {
      return new AppError('NETWORK', 'No connection to the server. Check your network and retry.');
    }
  }

  return new AppError('UNKNOWN', fallback);
}

export function errorMessage(error: unknown, fallback?: string): string {
  return toAppError(error, fallback).message;
}
