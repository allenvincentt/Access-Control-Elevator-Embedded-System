import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/errors';
import { LOGS_PAGE_SIZE, listAccessLogs } from '@/services/logsService';
import type { AccessDecision, AccessLogRow } from '@/types/database';

export type LogDecisionFilter = AccessDecision | 'all';

export function useAccessLogs() {
  const [rows, setRows] = useState<AccessLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<LogDecisionFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const requestId = useRef(0);
  const mounted = useRef(true);

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

  const load = useCallback(
    async (nextPage: number, mode: 'initial' | 'refresh' | 'more') => {
      const id = requestId.current + 1;
      requestId.current = id;

      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') setLoadingMore(true);
      setError(null);

      try {
        const result = await listAccessLogs({
          decision,
          search: debouncedSearch,
          page: nextPage,
          pageSize: LOGS_PAGE_SIZE,
        });

        if (!mounted.current || requestId.current !== id) return;

        setRows((current) => (mode === 'more' ? [...current, ...result.rows] : result.rows));
        setTotal(result.total);
        setPage(result.page);
        setHasMore(result.hasMore);
      } catch (caught) {
        if (mounted.current && requestId.current === id) {
          setError(errorMessage(caught, 'Access logs could not be loaded.'));
        }
      } finally {
        if (mounted.current && requestId.current === id) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [debouncedSearch, decision],
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

  const refresh = useCallback(() => load(0, 'refresh'), [load]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    await load(page + 1, 'more');
  }, [hasMore, load, loading, loadingMore, page]);

  return {
    rows,
    total,
    hasMore,
    loading,
    refreshing,
    loadingMore,
    error,
    decision,
    setDecision,
    search,
    setSearch,
    refresh,
    loadMore,
  };
}
