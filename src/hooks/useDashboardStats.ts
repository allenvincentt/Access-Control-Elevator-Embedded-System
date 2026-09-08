import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/errors';
import { fetchDashboardStats } from '@/services/staffService';
import type { DashboardStats } from '@/types/database';

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const next = await fetchDashboardStats();
      if (mounted.current) setStats(next);
    } catch (caught) {
      if (mounted.current) setError(errorMessage(caught, 'The dashboard could not be loaded.'));
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) void load(false);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load]);

  return { stats, loading, refreshing, error, refresh: () => load(true) };
}
