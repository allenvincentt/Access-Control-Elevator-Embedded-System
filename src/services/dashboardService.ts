import { toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { HomeOverview } from '@/types/database';

/**
 * The device timezone decides where "today" starts. Falls back to UTC on the
 * rare platform without a resolved Intl timezone (old Android WebViews).
 */
function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Everything the admin Home screen renders, aggregated server side by
 * `admin_home_overview()` (migration 0013) so a busy log table never has to be
 * paged into the app just to be counted.
 */
export async function fetchHomeOverview(): Promise<HomeOverview> {
  const { data, error } = await supabase.rpc('admin_home_overview', {
    p_timezone: deviceTimeZone(),
  });
  if (error) throw toAppError(error, 'The dashboard could not be loaded.');
  return data as unknown as HomeOverview;
}
