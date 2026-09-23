import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/errors';
import {
  fetchHomeInsights,
  fetchHomeOverview,
  type HomeInsights,
} from '@/services/dashboardService';
import type { HomeOverview } from '@/types/database';

/** Silent background refresh, so the dashboard stays close to live. */
const AUTO_REFRESH_MS = 60_000;

export function useHomeOverview() {
  const [overview, setOverview] = useState<HomeOverview | null>(null);
  const [insights, setInsights] = useState<HomeInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    if (inFlight.current) return;
    inFlight.current = true;

    if (mode === 'refresh') setRefreshing(true);
    if (mode !== 'silent') setError(null);

    try {
      const [next, extra] = await Promise.all([
        fetchHomeOverview(),
        fetchHomeInsights().catch(() => null),
      ]);
      if (!mounted.current) return;
      setOverview(next);
      if (extra) setInsights(extra);
      setError(null);
    } catch (caught) {
      if (!mounted.current || mode === 'silent') return;
      setError(errorMessage(caught, 'The dashboard could not be loaded.'));
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const first = setTimeout(() => {
      if (!cancelled) void load('initial');
    }, 0);
    const poll = setInterval(() => void load('silent'), AUTO_REFRESH_MS);

    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [load]);

  return {
    overview,
    insights,
    loading,
    refreshing,
    error,
    refresh: useCallback(() => load('refresh'), [load]),
  };
}

export default useHomeOverview;
