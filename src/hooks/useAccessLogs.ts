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

function mergeAttempts(current: AccessAttempt[], incoming: AccessAttempt[]): AccessAttempt[] {
  const merged = new Map(current.map((attempt) => [attempt.key, attempt]));
  incoming.forEach((attempt) => merged.set(attempt.key, attempt));
  return Array.from(merged.values()).sort(
    (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
  );
}

export function useAccessLogs() {
  const [attempts, setAttempts] = useState<AccessAttempt[]>([]);
  const [badges, setBadges] = useState<Record<string, AttemptBadge>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
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

        setAttempts((current) =>
          mode === 'more' ? mergeAttempts(current, result.attempts) : result.attempts,
        );
        setBadges((current) =>
          mode === 'more' ? { ...current, ...result.badges } : result.badges,
        );
        setPage(result.page);
        setHasMore(result.hasMore);
        void hydratePhotos(result.badges);
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
    [debouncedSearch, decision, hydratePhotos],
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
    attempts,
    badges,
    photoUrls,
    total: attempts.length,
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
