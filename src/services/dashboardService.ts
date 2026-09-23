import { toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { signedPhotoUrls } from '@/services/storageService';
import type { AccessLogRow, DenialReason, HomeOverview } from '@/types/database';

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

export const INSIGHT_MONTHS = 6;
export const MOST_ACTIVE_DAYS = 7;
export const MOST_ACTIVE_LIMIT = 5;
const MOST_ACTIVE_SCAN_CAP = 5000;

export type LastEntry = Pick<
  AccessLogRow,
  'occurred_at' | 'staff_name_snapshot' | 'scanned_company_id' | 'floor'
>;

export type MonthTally = {
  key: string;
  label: string;
  year: number;
  attempts: number;
};

export type ActiveStaff = {
  staffId: string;
  name: string;
  companyId: string;
  attempts: number;
  photoUrl: string | null;
};

export type HomeInsights = {
  lockouts: { face: number; badge: number };
  lastEntry: LastEntry | null;
  months: MonthTally[];
  mostActive: ActiveStaff[];
};

type ScanRow = Pick<AccessLogRow, 'staff_id' | 'staff_name_snapshot' | 'scanned_company_id'>;

function rankStaff(rows: ScanRow[]): ActiveStaff[] {
  const tally = new Map<string, ActiveStaff>();
  for (const row of rows) {
    if (!row.staff_id) continue;
    const current = tally.get(row.staff_id);
    if (current) {
      current.attempts += 1;
      continue;
    }
    tally.set(row.staff_id, {
      staffId: row.staff_id,
      name: row.staff_name_snapshot ?? `Badge ${row.scanned_company_id}`,
      companyId: row.scanned_company_id,
      attempts: 1,
      photoUrl: null,
    });
  }
  return Array.from(tally.values())
    .sort((a, b) => b.attempts - a.attempts || a.name.localeCompare(b.name))
    .slice(0, MOST_ACTIVE_LIMIT);
}

async function withPhotos(staff: ActiveStaff[]): Promise<ActiveStaff[]> {
  if (staff.length === 0) return staff;
  try {
    const { data, error } = await supabase
      .from('staff')
      .select('id, photo_path')
      .in(
        'id',
        staff.map((member) => member.staffId),
      );
    if (error || !data) return staff;

    const paths = new Map(
      (data as { id: string; photo_path: string | null }[]).map((row) => [row.id, row.photo_path]),
    );
    const urls = await signedPhotoUrls(Array.from(paths.values()));
    return staff.map((member) => {
      const path = paths.get(member.staffId);
      return { ...member, photoUrl: path ? (urls[path] ?? null) : null };
    });
  } catch {
    return staff;
  }
}

async function countLogs(
  apply: (query: ReturnType<typeof baseCount>) => ReturnType<typeof baseCount>,
): Promise<number> {
  const { count, error } = await apply(baseCount());
  if (error) throw toAppError(error, 'The dashboard could not be loaded.');
  return count ?? 0;
}

function baseCount() {
  return supabase.from('access_logs').select('id', { count: 'exact', head: true });
}

export async function fetchHomeInsights(now = new Date()): Promise<HomeInsights> {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const activeStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (MOST_ACTIVE_DAYS - 1),
  ).toISOString();

  const monthStarts = Array.from({ length: INSIGHT_MONTHS + 1 }, (_, index) => {
    const offset = INSIGHT_MONTHS - 1 - index;
    return new Date(now.getFullYear(), now.getMonth() - offset, 1);
  });

  const lockout = (reason: DenialReason) =>
    countLogs((query) =>
      query.eq('decision', 'Denied').eq('reason', reason).gte('occurred_at', todayStart),
    );

  const monthCounts = monthStarts.slice(0, -1).map((start, index) =>
    countLogs((query) =>
      query
        .eq('stage', 'Barcode')
        .gte('occurred_at', start.toISOString())
        .lt('occurred_at', monthStarts[index + 1].toISOString()),
    ),
  );

  const lastEntryQuery = supabase
    .from('access_logs')
    .select('occurred_at, staff_name_snapshot, scanned_company_id, floor')
    .eq('stage', 'Face')
    .eq('decision', 'Granted')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const scansQuery = supabase
    .from('access_logs')
    .select('staff_id, staff_name_snapshot, scanned_company_id')
    .eq('stage', 'Barcode')
    .not('staff_id', 'is', null)
    .gte('occurred_at', activeStart)
    .order('occurred_at', { ascending: false })
    .limit(MOST_ACTIVE_SCAN_CAP);

  const [face, badge, lastEntryResult, scansResult, ...attempts] = await Promise.all([
    lockout('TooManyAttempts'),
    lockout('RateLimited'),
    lastEntryQuery,
    scansQuery,
    ...monthCounts,
  ]);

  if (lastEntryResult.error) {
    throw toAppError(lastEntryResult.error, 'The dashboard could not be loaded.');
  }
  if (scansResult.error) {
    throw toAppError(scansResult.error, 'The dashboard could not be loaded.');
  }

  return {
    lockouts: { face, badge },
    lastEntry: (lastEntryResult.data as LastEntry | null) ?? null,
    months: monthStarts.slice(0, -1).map((start, index) => ({
      key: `${start.getFullYear()}-${start.getMonth() + 1}`,
      label: start.toLocaleDateString(undefined, { month: 'short' }),
      year: start.getFullYear(),
      attempts: attempts[index],
    })),
    mostActive: await withPhotos(rankStaff((scansResult.data ?? []) as ScanRow[])),
  };
}
