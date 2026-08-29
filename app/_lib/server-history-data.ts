"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/app/_lib/auth-context";
import {
  getDateRangeFromFilters,
  hasEmptyMultiSelection,
  normalizeMarketplaceIdentity,
  type Carrier,
  type DispatchPackage,
  type Marketplace,
  type PackageFilterValues,
  type ReportSummaryItem,
  type Store,
} from "@/app/_lib/mock-data";
import {
  formatDatabaseError,
  getDashboardDespacho,
  getPacotesPaginados,
  type DashboardDispatchData,
  type PackageHistoryMetrics,
  type ServerPackageQuery,
} from "@/lib/database";
import { retrySupabaseReadForJwtClockSkew } from "@/lib/supabase-jwt-retry";

type HistoryCatalogs = {
  stores: Store[];
  marketplaces: Marketplace[];
  carriers: Carrier[];
};

const emptyPackageMetrics: PackageHistoryMetrics = {
  total: 0,
  melhorEnvio: 0,
  pending: 0,
};

const emptyDashboardMetrics = {
  total: 0,
  melhorEnvio: 0,
  semTransportadora: 0,
  pending: 0,
  coletas: 0,
  postagens: 0,
};

function selectedIdsByName(
  selectedNames: string[],
  items: Array<{ id: string; name: string }>,
) {
  const selected = new Set(selectedNames.map(normalizeMarketplaceIdentity));
  return items
    .filter((item) => selected.has(normalizeMarketplaceIdentity(item.name)))
    .map((item) => item.id);
}

export function createServerPackageQuery(
  filters: PackageFilterValues,
  catalogs: HistoryCatalogs,
): ServerPackageQuery {
  const dateRange = getDateRangeFromFilters(filters);
  const incompleteDateSelection =
    (filters.dateMode === "single" && !dateRange.startDate) ||
    (filters.dateMode === "range" && !dateRange.endDate);
  const storesExplicitlyEmpty = hasEmptyMultiSelection(filters, "lojaId");
  const marketplacesExplicitlyEmpty = hasEmptyMultiSelection(
    filters,
    "marketplace",
  );
  const carriersExplicitlyEmpty = hasEmptyMultiSelection(
    filters,
    "transportadora",
  );
  const selectedCarrierNames = filters.transportadora.filter(
    (value) => value !== "sem-transportadora",
  );
  const hasCarrierSelection = filters.transportadora.length > 0;

  let marketplaceIds: string[] | null = null;
  if (marketplacesExplicitlyEmpty) {
    marketplaceIds = [];
  } else if (filters.marketplaceId?.trim()) {
    marketplaceIds = [filters.marketplaceId.trim()];
  } else if (filters.marketplace.length) {
    marketplaceIds = selectedIdsByName(
      filters.marketplace,
      catalogs.marketplaces,
    );
  }

  return {
    startDate: dateRange.startDate || null,
    endDate: dateRange.endDate || null,
    storeIds: incompleteDateSelection || storesExplicitlyEmpty
      ? []
      : filters.lojaId.length
        ? [...filters.lojaId]
        : null,
    marketplaceIds,
    carrierIds:
      carriersExplicitlyEmpty || hasCarrierSelection
        ? selectedIdsByName(selectedCarrierNames, catalogs.carriers)
        : null,
    includeWithoutCarrier:
      !carriersExplicitlyEmpty &&
      (!hasCarrierSelection ||
        filters.transportadora.includes("sem-transportadora")),
    filterCarrier: carriersExplicitlyEmpty || hasCarrierSelection,
    melhorEnvio:
      filters.melhorEnvio === "todos"
        ? null
        : filters.melhorEnvio === "sim",
    operation:
      filters.tipoOperacao === "todos" ? null : filters.tipoOperacao,
    search: filters.query?.trim() || null,
    batchCode: filters.codigoLote?.trim() || null,
  };
}

type PackageHistoryState = {
  items: DispatchPackage[];
  total: number;
  metrics: PackageHistoryMetrics;
  hasMore: boolean;
  nextCursor: { bipadoEm: string; id: string } | null;
  snapshotAt: string | null;
  fallbackOffset: number;
  loading: boolean;
  loadingMore: boolean;
  error: string;
};

const initialPackageHistoryState: PackageHistoryState = {
  items: [],
  total: 0,
  metrics: emptyPackageMetrics,
  hasMore: false,
  nextCursor: null,
  snapshotAt: null,
  fallbackOffset: 0,
  loading: true,
  loadingMore: false,
  error: "",
};

function appendUniquePackages(
  currentItems: DispatchPackage[],
  incomingItems: DispatchPackage[],
) {
  const knownIds = new Set(currentItems.map((item) => item.id));
  return [
    ...currentItems,
    ...incomingItems.filter((item) => {
      if (knownIds.has(item.id)) return false;
      knownIds.add(item.id);
      return true;
    }),
  ];
}

function parseServerPackageQuery(queryKey: string) {
  return JSON.parse(queryKey) as ServerPackageQuery;
}

export function usePaginatedPackageHistory(
  filters: PackageFilterValues,
  catalogs: HistoryCatalogs,
) {
  const { loading: authLoading, user } = useAuth();
  const userId = user?.id ?? null;
  const query = useMemo(
    () => createServerPackageQuery(filters, catalogs),
    [catalogs, filters],
  );
  const queryKey = useMemo(() => JSON.stringify(query), [query]);
  const activeQueryKeyRef = useRef(queryKey);
  const activeUserIdRef = useRef(userId);
  const requestIdRef = useRef(0);
  const [state, setState] = useState<PackageHistoryState>(
    initialPackageHistoryState,
  );
  useLayoutEffect(() => {
    activeQueryKeyRef.current = queryKey;
    activeUserIdRef.current = userId;
    requestIdRef.current += 1;
  }, [authLoading, queryKey, userId]);

  useEffect(() => {
    const requestId = requestIdRef.current;
    const requestQuery = parseServerPackageQuery(queryKey);
    let cancelled = false;

    if (authLoading) {
      queueMicrotask(() => {
        if (!cancelled) setState(initialPackageHistoryState);
      });
      return () => {
        cancelled = true;
      };
    }

    if (!userId) {
      queueMicrotask(() => {
        if (!cancelled) {
          setState({ ...initialPackageHistoryState, loading: false });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => {
      if (!cancelled) setState(initialPackageHistoryState);
    });
    const handle = setTimeout(() => {
      void retrySupabaseReadForJwtClockSkew(
        () =>
          getPacotesPaginados(
            requestQuery,
            {
              offset: 0,
              limit: 100,
              cursor: null,
              snapshotAt: null,
              includeMetrics: true,
            },
            { userId },
          ),
        {
          shouldContinue: () =>
            !cancelled &&
            requestId === requestIdRef.current &&
            queryKey === activeQueryKeyRef.current &&
            userId === activeUserIdRef.current,
        },
      )
        .then((result) => {
          if (
            cancelled ||
            requestId !== requestIdRef.current ||
            queryKey !== activeQueryKeyRef.current ||
            userId !== activeUserIdRef.current
          ) {
            return;
          }
          setState({
            items: result.items,
            total: result.total,
            metrics: result.metrics,
            hasMore: result.hasMore,
            nextCursor: result.nextCursor,
            snapshotAt: result.snapshotAt,
            fallbackOffset: result.offset + result.items.length,
            loading: false,
            loadingMore: false,
            error: "",
          });
        })
        .catch((error) => {
          if (
            cancelled ||
            requestId !== requestIdRef.current ||
            userId !== activeUserIdRef.current
          ) {
            return;
          }
          setState({
            ...initialPackageHistoryState,
            loading: false,
            error: formatDatabaseError(error),
          });
        });
    }, filters.query?.trim() ? 220 : 0);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [authLoading, filters.query, queryKey, userId]);

  const loadMore = useCallback(async () => {
    if (
      !userId ||
      state.loading ||
      state.loadingMore ||
      !state.hasMore
    ) {
      return;
    }

    const expectedQueryKey = queryKey;
    const expectedRequestId = requestIdRef.current;
    const expectedUserId = userId;
    const offset = state.fallbackOffset;
    const cursor = state.nextCursor;
    const snapshotAt = state.snapshotAt;
    const requestQuery = parseServerPackageQuery(expectedQueryKey);
    setState((current) => ({ ...current, loadingMore: true, error: "" }));

    try {
      const result = await retrySupabaseReadForJwtClockSkew(
        () =>
          getPacotesPaginados(
            requestQuery,
            {
              offset,
              limit: 100,
              cursor,
              snapshotAt,
              includeMetrics: false,
            },
            { userId: expectedUserId },
          ),
        {
          shouldContinue: () =>
            expectedQueryKey === activeQueryKeyRef.current &&
            expectedRequestId === requestIdRef.current &&
            expectedUserId === activeUserIdRef.current,
        },
      );
      if (
        expectedQueryKey !== activeQueryKeyRef.current ||
        expectedRequestId !== requestIdRef.current ||
        expectedUserId !== activeUserIdRef.current
      ) {
        return;
      }
      setState((current) => {
        const emptyContinuation = offset > 0 && result.items.length === 0;
        return {
          ...current,
          items: appendUniquePackages(current.items, result.items),
          total: current.total,
          metrics: current.metrics,
          hasMore: emptyContinuation ? false : result.hasMore,
          nextCursor: emptyContinuation ? null : result.nextCursor,
          snapshotAt: result.snapshotAt ?? current.snapshotAt,
          fallbackOffset: emptyContinuation
            ? current.fallbackOffset
            : result.offset + result.items.length,
          loadingMore: false,
        };
      });
    } catch (error) {
      if (
        expectedQueryKey !== activeQueryKeyRef.current ||
        expectedRequestId !== requestIdRef.current ||
        expectedUserId !== activeUserIdRef.current
      ) {
        return;
      }
      setState((current) => ({
        ...current,
        loadingMore: false,
        error: formatDatabaseError(error),
      }));
    }
  }, [
    queryKey,
    state.fallbackOffset,
    state.hasMore,
    state.loading,
    state.loadingMore,
    state.nextCursor,
    state.snapshotAt,
    userId,
  ]);

  return { ...state, loadMore };
}

type DashboardState = {
  metrics: DashboardDispatchData["metrics"];
  storeCounts: Record<string, number>;
  summary: ReportSummaryItem[];
  recentPackages: DispatchPackage[];
  movementCount: number;
  loading: boolean;
  error: string;
};

const initialDashboardState: DashboardState = {
  metrics: emptyDashboardMetrics,
  storeCounts: {},
  summary: [],
  recentPackages: [],
  movementCount: 0,
  loading: true,
  error: "",
};

export function useServerDashboardData(
  filters: PackageFilterValues,
  catalogs: HistoryCatalogs,
) {
  const { loading: authLoading, user } = useAuth();
  const userId = user?.id ?? null;
  const query = useMemo(
    () => createServerPackageQuery(filters, catalogs),
    [catalogs, filters],
  );
  const queryKey = useMemo(() => JSON.stringify(query), [query]);
  const activeUserIdRef = useRef(userId);
  const requestIdRef = useRef(0);
  const [state, setState] = useState<DashboardState>(initialDashboardState);
  useLayoutEffect(() => {
    activeUserIdRef.current = userId;
    requestIdRef.current += 1;
  }, [authLoading, queryKey, userId]);

  useEffect(() => {
    const requestId = requestIdRef.current;
    const requestQuery = parseServerPackageQuery(queryKey);
    let cancelled = false;

    if (authLoading) {
      queueMicrotask(() => {
        if (!cancelled) setState(initialDashboardState);
      });
      return () => {
        cancelled = true;
      };
    }

    if (!userId) {
      queueMicrotask(() => {
        if (!cancelled) {
          setState({ ...initialDashboardState, loading: false });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => {
      if (!cancelled) setState(initialDashboardState);
    });
    const handle = setTimeout(() => {
      void retrySupabaseReadForJwtClockSkew(
        () => getDashboardDespacho(requestQuery, { userId }),
        {
          shouldContinue: () =>
            !cancelled &&
            requestId === requestIdRef.current &&
            userId === activeUserIdRef.current,
        },
      )
        .then((result) => {
          if (
            cancelled ||
            requestId !== requestIdRef.current ||
            userId !== activeUserIdRef.current
          ) {
            return;
          }
          setState({
            metrics: result.metrics,
            storeCounts: result.storeCounts,
            summary: result.summary,
            recentPackages: result.recentPackages,
            movementCount: result.movementCount,
            loading: false,
            error: "",
          });
        })
        .catch((error) => {
          if (
            cancelled ||
            requestId !== requestIdRef.current ||
            userId !== activeUserIdRef.current
          ) {
            return;
          }
          setState({
            ...initialDashboardState,
            loading: false,
            error: formatDatabaseError(error),
          });
        });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [authLoading, queryKey, userId]);

  return state;
}
