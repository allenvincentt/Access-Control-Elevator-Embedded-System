import type { AuthError, Session } from '@supabase/supabase-js';

import { AppError, toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { ProfileRow } from '@/types/database';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function mapAuthError(error: AuthError): AppError {
  const status = error.status ?? 0;
  const message = error.message ?? '';

  if (status === 429 || /rate limit/i.test(message)) {
    return new AppError('RATE_LIMITED', 'Too many sign-in attempts. Wait a minute and try again.');
  }
  if (/email not confirmed/i.test(message)) {
    return new AppError('EMAIL_UNCONFIRMED', 'This account has not been confirmed yet.');
  }
  if (status === 400 || status === 401 || /invalid login credentials/i.test(message)) {
    return new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  return toAppError(error, 'Sign in failed. Try again.');
}

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const normalised = email.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(normalised) || normalised.length > 254) {
    throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  if (password.length === 0 || password.length > 128) {
    throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalised,
    password,
  });

  if (error) throw mapAuthError(error);
  if (!data.session) throw new AppError('NO_SESSION', 'Sign in failed. Try again.');

  return data.session;
}

export async function signOutEverywhere(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error && error.status !== 401 && error.status !== 403) {
    throw toAppError(error, 'Sign out failed.');
  }
}

export async function fetchProfile(userId: string): Promise<ProfileRow> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, email, user_role, is_active, created_at, updated_at',
    )
    .eq('id', userId)
    .single();

  if (error) throw toAppError(error, 'Could not load your profile.');
  return data as ProfileRow;
}

export async function updateOwnDisplayName(userId: string, fullName: string): Promise<ProfileRow> {
  const trimmed = fullName.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2 || trimmed.length > 120) {
    throw new AppError('INVALID_NAME', 'Enter a name between 2 and 120 characters.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: trimmed })
    .eq('id', userId)
    .select(
      'id, full_name, email, user_role, is_active, created_at, updated_at',
    )
    .single();

  if (error) throw toAppError(error, 'Could not update your name.');
  return data as ProfileRow;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const normalised = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalised)) {
    throw new AppError('INVALID_EMAIL', 'Enter the email address on your account.');
  }
  const { error } = await supabase.auth.resetPasswordForEmail(normalised);
  if (error) throw mapAuthError(error);
}
