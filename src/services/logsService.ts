import { toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type {
  AccessDecision,
  AccessLogRow,
  AccessStage,
  DenialReason,
  FloorKey,
  StaffRoleKey,
} from '@/types/database';

const LOG_COLUMNS =
  'id, occurred_at, stage, decision, reason, staff_id, scanned_company_id, staff_name_snapshot, floor, device_id, match_score, session_id';

export const LOGS_PAGE_SIZE = 25;

export const REDACTED_COMPANY_ID = '(redacted)';

export function isAnonymizedAttempt(attempt: AccessAttempt): boolean {
  return attempt.companyId === REDACTED_COMPANY_ID;
}

export type AttemptOutcome = AccessDecision | 'Incomplete';

export type AccessAttempt = {
  key: string;
  sessionId: string | null;
  occurredAt: string;
  staffId: string | null;
  staffName: string | null;
  companyId: string;
  floor: FloorKey | null;
  barcode: AccessLogRow | null;
  face: AccessLogRow | null;
  outcome: AttemptOutcome;
  reason: DenialReason | null;
  matchScore: number | null;
};

export type AttemptBadge = {
  role: StaffRoleKey;
  photoPath: string | null;
};

export type LogFilter = {
  decision?: AccessDecision | 'all';
  stage?: AccessStage | 'all';
  search?: string;
  from?: string | null;
  until?: string | null;
  order?: 'desc' | 'asc';
  page?: number;
  pageSize?: number;
};

export type LogsResult = {
  attempts: AccessAttempt[];
  badges: Record<string, AttemptBadge>;
  page: number;
  total: number;
  hasMore: boolean;
};

function attemptKey(row: AccessLogRow): string {
  return row.session_id ?? `row:${row.id}`;
}

function latest(rows: AccessLogRow[], stage: AccessStage): AccessLogRow | null {
  return (
    rows
      .filter((row) => row.stage === stage)
      .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0] ?? null
  );
}

function toAttempt(key: string, rows: AccessLogRow[]): AccessAttempt {
  const barcode = latest(rows, 'Barcode');
  const face = latest(rows, 'Face');
  const newest = rows.reduce((best, row) =>
    Date.parse(row.occurred_at) > Date.parse(best.occurred_at) ? row : best,
  );

  const denied = face?.decision === 'Denied' ? face : barcode?.decision === 'Denied' ? barcode : null;
  const outcome: AttemptOutcome =
    face?.decision === 'Granted' ? 'Granted' : denied ? 'Denied' : 'Incomplete';

  return {
    key,
    sessionId: newest.session_id,
    occurredAt: newest.occurred_at,
    staffId: rows.find((row) => row.staff_id)?.staff_id ?? null,
    staffName: rows.find((row) => row.staff_name_snapshot)?.staff_name_snapshot ?? null,
    companyId: newest.scanned_company_id,
    floor: rows.find((row) => row.floor)?.floor ?? null,
    barcode,
    face,
    outcome,
    reason: denied?.reason ?? null,
    matchScore: face?.match_score ?? barcode?.match_score ?? null,
  };
}

function groupRows(rows: AccessLogRow[], order: 'desc' | 'asc' = 'desc'): AccessAttempt[] {
  const buckets = new Map<string, AccessLogRow[]>();
  rows.forEach((row) => {
    const key = attemptKey(row);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  });

  const direction = order === 'asc' ? -1 : 1;
  return Array.from(buckets, ([key, bucket]) => toAttempt(key, bucket)).sort(
    (a, b) => direction * (Date.parse(b.occurredAt) - Date.parse(a.occurredAt)),
  );
}

async function completeSessions(rows: AccessLogRow[]): Promise<AccessLogRow[]> {
  const sessionIds = Array.from(
    new Set(rows.map((row) => row.session_id).filter((id): id is string => Boolean(id))),
  );
  if (sessionIds.length === 0) return rows;

  const { data, error } = await supabase
    .from('access_logs')
    .select(LOG_COLUMNS)
    .in('session_id', sessionIds);

  if (error) throw toAppError(error, 'Access logs could not be loaded.');

  const merged = new Map(rows.map((row) => [row.id, row]));
  ((data ?? []) as AccessLogRow[]).forEach((row) => merged.set(row.id, row));
  return Array.from(merged.values());
}

async function fetchBadges(staffIds: string[]): Promise<Record<string, AttemptBadge>> {
  if (staffIds.length === 0) return {};

  const { data, error } = await supabase
    .from('staff')
    .select('id, role, photo_path')
    .in('id', staffIds);

  if (error || !data) return {};

  const badges: Record<string, AttemptBadge> = {};
  (data as { id: string; role: StaffRoleKey; photo_path: string | null }[]).forEach((row) => {
    badges[row.id] = { role: row.role, photoPath: row.photo_path };
  });
  return badges;
}

export async function listAccessLogs(filter: LogFilter = {}): Promise<LogsResult> {
  const page = Math.max(0, filter.page ?? 0);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? LOGS_PAGE_SIZE));
  const from = page * pageSize;

  let query = supabase
    .from('access_logs')
    .select(LOG_COLUMNS, { count: 'exact' })
    .order('occurred_at', { ascending: filter.order === 'asc' })
    .range(from, from + pageSize - 1);

  if (filter.from) {
    query = query.gte('occurred_at', filter.from);
  }
  if (filter.until) {
    query = query.lt('occurred_at', filter.until);
  }

  if (filter.decision && filter.decision !== 'all') {
    query = query.eq('decision', filter.decision);
  }
  if (filter.stage && filter.stage !== 'all') {
    query = query.eq('stage', filter.stage);
  }

  const search = filter.search?.trim().toUpperCase().replace(/[%_\\]/g, '') ?? '';
  if (search.length > 0) {
    query = query.like('scanned_company_id', `%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) throw toAppError(error, 'Access logs could not be loaded.');

  const pageRows = (data ?? []) as AccessLogRow[];
  const rows = await completeSessions(pageRows);
  let attempts = groupRows(rows, filter.order ?? 'desc').filter((attempt) =>
    pageRows.some(
      (row) => attemptKey(row) === attempt.key && row.occurred_at === attempt.occurredAt,
    ),
  );

  if (filter.decision && filter.decision !== 'all') {
    attempts = attempts.filter((attempt) => attempt.outcome === filter.decision);
  }

  const badges = await fetchBadges(
    Array.from(new Set(attempts.map((attempt) => attempt.staffId).filter(Boolean) as string[])),
  );

  return {
    attempts,
    badges,
    page,
    total: count ?? 0,
    hasMore: from + pageRows.length < (count ?? 0),
  };
}
