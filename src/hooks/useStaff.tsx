import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { errorMessage } from '@/lib/errors';
import { useAuth } from '@/hooks/useAuth';
import {
  STAFF_PAGE_SIZE,
  createStaff as createStaffRequest,
  deleteStaff as deleteStaffRequest,
  enrollStaffFace as enrollStaffFaceRequest,
  listStaff,
  resetStaffFace as resetStaffFaceRequest,
  updateStaff as updateStaffRequest,
  type StaffCreateInput,
  type StaffEditInput,
} from '@/services/staffService';
import { invalidateSignedUrl, signedPhotoUrls } from '@/services/storageService';
import type { AccessStatusKey, FaceSamplePayload, StaffRow } from '@/types/database';

type StatusFilter = AccessStatusKey | 'all';

type StaffContextValue = {
  items: StaffRow[];
  photoUrls: Record<string, string>;
  total: number;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (value: StatusFilter) => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  createStaff: (input: StaffCreateInput) => Promise<StaffRow>;
  updateStaff: (id: string, input: StaffEditInput) => Promise<StaffRow>;
  deleteStaff: (id: string) => Promise<void>;
  enrollFace: (id: string, samples: FaceSamplePayload[]) => Promise<void>;
  resetFace: (id: string) => Promise<void>;
};

const StaffContext = createContext<StaffContextValue | null>(null);

const SEARCH_DEBOUNCE_MS = 350;

export function StaffProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();

  const [items, setItems] = useState<StaffRow[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const hydratePhotos = useCallback(async (rows: StaffRow[]) => {
    const paths = rows.map((row) => row.photo_path).filter(Boolean);
    if (paths.length === 0) return;
    const urls = await signedPhotoUrls(paths);
    if (mounted.current) {
      setPhotoUrls((current) => ({ ...current, ...urls }));
    }
  }, []);

  const load = useCallback(
    async (nextPage: number, mode: 'initial' | 'refresh' | 'more') => {
      if (!isAdmin) {
        setItems([]);
        setTotal(0);
        setLoading(false);
        return;
      }

      const id = requestId.current + 1;
      requestId.current = id;

      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') setLoadingMore(true);
      setError(null);

      try {
        const result = await listStaff({
          search: debouncedSearch,
          status: statusFilter,
          page: nextPage,
          pageSize: STAFF_PAGE_SIZE,
        });

        if (!mounted.current || requestId.current !== id) return;

        setItems((current) => (mode === 'more' ? [...current, ...result.rows] : result.rows));
        setTotal(result.total);
        setPage(result.page);
        setHasMore(result.hasMore);
        void hydratePhotos(result.rows);
      } catch (caught) {
        if (mounted.current && requestId.current === id) {
          setError(errorMessage(caught, 'Staff could not be loaded.'));
        }
      } finally {
        if (mounted.current && requestId.current === id) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [debouncedSearch, hydratePhotos, isAdmin, statusFilter],
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

  const createStaff = useCallback(
    async (input: StaffCreateInput) => {
      const row = await createStaffRequest(input);
      await refresh();
      return row;
    },
    [refresh],
  );

  const updateStaff = useCallback(async (id: string, input: StaffEditInput) => {
    const previous = items.find((row) => row.id === id);
    if (previous?.photo_path && previous.photo_path !== input.photoPath) {
      invalidateSignedUrl(previous.photo_path);
    }
    const row = await updateStaffRequest(id, input);
    if (mounted.current) {
      setItems((current) => current.map((item) => (item.id === id ? row : item)));
      void hydratePhotos([row]);
    }
    return row;
  }, [hydratePhotos, items]);

  const deleteStaff = useCallback(
    async (id: string) => {
      const target = items.find((row) => row.id === id);
      await deleteStaffRequest(id, target?.photo_path);
      invalidateSignedUrl(target?.photo_path);
      if (mounted.current) {
        setItems((current) => current.filter((item) => item.id !== id));
        setTotal((current) => Math.max(0, current - 1));
      }
    },
    [items],
  );

  const enrollFace = useCallback(
    async (id: string, samples: FaceSamplePayload[]) => {
      await enrollStaffFaceRequest(id, samples);
      await refresh();
    },
    [refresh],
  );

  const resetFace = useCallback(
    async (id: string) => {
      await resetStaffFaceRequest(id);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<StaffContextValue>(
    () => ({
      items,
      photoUrls,
      total,
      loading,
      refreshing,
      loadingMore,
      hasMore,
      error,
      search,
      setSearch,
      statusFilter,
      setStatusFilter,
      refresh,
      loadMore,
      createStaff,
      updateStaff,
      deleteStaff,
      enrollFace,
      resetFace,
    }),
    [
      items,
      photoUrls,
      total,
      loading,
      refreshing,
      loadingMore,
      hasMore,
      error,
      search,
      statusFilter,
      refresh,
      loadMore,
      createStaff,
      updateStaff,
      deleteStaff,
      enrollFace,
      resetFace,
    ],
  );

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff(): StaffContextValue {
  const value = useContext(StaffContext);
  if (!value) {
    throw new Error('useStaff must be used inside <StaffProvider>.');
  }
  return value;
}
