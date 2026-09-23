import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/errors';
import {
  LOGS_PAGE_SIZE,
  listAccessLogs,
  type AccessAttempt,
  type AttemptBadge,
} from '@/services/logsService';
import { signedPhotoUrls } from '@/services/storageService';
import type { AccessDecision } from '@/types/database';

export type LogDecisionFilter = AccessDecision | 'all';

export type LogSortOrder = 'desc' | 'asc';

export type LogDateRange = { start: Date; end: Date } | null;

function dayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function rangeBounds(range: LogDateRange): { from: string | null; until: string | null } {
  if (!range) return { from: null, until: null };
  const start = dayStart(range.start);
  const end = dayStart(range.end);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), until: end.toISOString() };
}

export function useAccessLogs() {
  const [attempts, setAttempts] = useState<AccessAttempt[]>([]);
  const [badges, setBadges] = useState<Record<string, AttemptBadge>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(LOGS_PAGE_SIZE);
  const [records, setRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<LogDecisionFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateRange, setDateRange] = useState<LogDateRange>(null);
  const [order, setOrder] = useState<LogSortOrder>('desc');

  const requestId = useRef(0);
  const mounted = useRef(true);
  const pageRef = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const hydratePhotos = useCallback(async (next: Record<string, AttemptBadge>) => {
    const paths = Object.values(next)
      .map((badge) => badge.photoPath)
      .filter((path): path is string => Boolean(path));
    if (paths.length === 0) return;

    const urls = await signedPhotoUrls(paths);
    if (mounted.current) {
      setPhotoUrls((current) => ({ ...current, ...urls }));
    }
  }, []);

  const load = useCallback(
    async (nextPage: number, mode: 'initial' | 'refresh' | 'page') => {
      const id = requestId.current + 1;
      requestId.current = id;

      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'page') setPaging(true);
      setError(null);

      try {
        const bounds = rangeBounds(dateRange);
        const result = await listAccessLogs({
          decision,
          search: debouncedSearch,
          from: bounds.from,
          until: bounds.until,
          order,
          page: nextPage,
          pageSize,
        });

        if (!mounted.current || requestId.current !== id) return;

        setAttempts(result.attempts);
        setBadges(result.badges);
        setPage(result.page);
        pageRef.current = result.page;
        setRecords(result.total);
        void hydratePhotos(result.badges);
      } catch (caught) {
        if (mounted.current && requestId.current === id) {
          setError(errorMessage(caught, 'Access logs could not be loaded.'));
        }
      } finally {
        if (mounted.current && requestId.current === id) {
          setLoading(false);
          setRefreshing(false);
          setPaging(false);
        }
      }
    },
    [dateRange, debouncedSearch, decision, hydratePhotos, order, pageSize],
  );

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) void load(0, 'initial');
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load]);

  const refresh = useCallback(() => load(pageRef.current, 'refresh'), [load]);

  const goToPage = useCallback(
    (next: number) => {
      if (next < 0 || next === pageRef.current) return;
      void load(next, 'page');
    },
    [load],
  );

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
  }, []);

  return {
    attempts,
    badges,
    photoUrls,
    total: attempts.length,
    records,
    page,
    pageSize,
    loading,
    refreshing,
    paging,
    error,
    decision,
    setDecision,
    search,
    setSearch,
    dateRange,
    setDateRange,
    order,
    setOrder,
    refresh,
    goToPage,
    setPageSize,
  };
}
