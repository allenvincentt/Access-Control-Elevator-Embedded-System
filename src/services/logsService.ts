import { toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { AccessDecision, AccessLogRow, AccessStage } from '@/types/database';

const LOG_COLUMNS =
  'id, occurred_at, stage, decision, reason, staff_id, scanned_company_id, staff_name_snapshot, floor, device_id, match_score, session_id';

export const LOGS_PAGE_SIZE = 30;

export type LogFilter = {
  decision?: AccessDecision | 'all';
  stage?: AccessStage | 'all';
  search?: string;
  page?: number;
  pageSize?: number;
};

export type LogsResult = {
  rows: AccessLogRow[];
  total: number;
  page: number;
  hasMore: boolean;
};

export async function listAccessLogs(filter: LogFilter = {}): Promise<LogsResult> {
  const page = Math.max(0, filter.page ?? 0);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? LOGS_PAGE_SIZE));
  const from = page * pageSize;

  let query = supabase
    .from('access_logs')
    .select(LOG_COLUMNS, { count: 'exact' })
    .order('occurred_at', { ascending: false })
    .range(from, from + pageSize - 1);

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

  const total = count ?? 0;
  return {
    rows: (data ?? []) as AccessLogRow[],
    total,
    page,
    hasMore: from + (data?.length ?? 0) < total,
  };
}
