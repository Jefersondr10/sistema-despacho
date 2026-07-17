"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { canDisplayAccountData } from "@/app/_lib/account-scope";
import { useAuth } from "@/app/_lib/auth-context";
import type {
  Carrier,
  DispatchBatch,
  DispatchPackage,
  Marketplace,
  PackageCancellation,
  PackageMovement,
  Store,
} from "@/app/_lib/mock-data";
import {
  formatDatabaseError,
  getLojas,
  getMarketplaces,
  getMovimentacoes,
  getPacotesCanceladosComRelacionamentos,
  getPacotesComRelacionamentos,
  getSessoesBipagemComRelacionamentos,
  getTransportadoras,
  mapCancelamentoRowToPackageCancellation,
  mapLojaRowToStore,
  mapMarketplaceRowToMarketplace,
  mapMovimentacaoRowToPackageMovement,
  mapPacoteRowToDispatchPackage,
  mapSessaoRowToDispatchBatch,
  mapTransportadoraRowToCarrier,
} from "@/lib/database";
import {
  isSupabaseConfigured,
  SUPABASE_NOT_CONFIGURED_MESSAGE,
} from "@/lib/supabaseClient";

type CatalogState = {
  stores: Store[];
  marketplaces: Marketplace[];
  carriers: Carrier[];
};

type DispatchDataState = {
  ownerUserId: string | null;
  catalogs: CatalogState;
  packages: DispatchPackage[];
  allPackages: DispatchPackage[];
  batches: DispatchBatch[];
  movements: PackageMovement[];
  cancellations: PackageCancellation[];
  loading: boolean;
  error: string;
};

const emptyCatalogs: CatalogState = {
  stores: [],
  marketplaces: [],
  carriers: [],
};

function createInitialState(
  loading = true,
  error = "",
  ownerUserId: string | null = null,
): DispatchDataState {
  return {
    ownerUserId,
    catalogs: emptyCatalogs,
    packages: [],
    allPackages: [],
    batches: [],
    movements: [],
    cancellations: [],
    loading,
    error,
  };
}

const initialState = createInitialState();

export function useSupabaseDispatchData() {
  const { loading: authLoading, user } = useAuth();
  const userId = user?.id ?? null;
  const reloadRequestIdRef = useRef(0);
  const [state, setState] = useState<DispatchDataState>(initialState);

  const reload = useCallback(async () => {
    const requestId = ++reloadRequestIdRef.current;
    const requestedUserId = userId;
    const isCurrentRequest = () => requestId === reloadRequestIdRef.current;

    if (!isSupabaseConfigured()) {
      setState(createInitialState(false, SUPABASE_NOT_CONFIGURED_MESSAGE));
      return;
    }

    if (authLoading) {
      setState(createInitialState(true));
      return;
    }

    if (!requestedUserId) {
      setState(createInitialState(false));
      return;
    }

    setState(createInitialState(true, "", requestedUserId));

    try {
      const [
        lojasRows,
        marketplacesRows,
        transportadorasRows,
        pacoteRows,
        allPacoteRows,
        sessaoRows,
        movementRows,
        cancellationRows,
      ] = await Promise.all([
        getLojas({ incluirInativos: true }),
        getMarketplaces({ incluirInativos: true }),
        getTransportadoras({ incluirInativos: true }),
        getPacotesComRelacionamentos(),
        getPacotesComRelacionamentos(
          { incluirCancelados: true },
        ),
        getSessoesBipagemComRelacionamentos(),
        getMovimentacoes(),
        getPacotesCanceladosComRelacionamentos(),
      ]);

      const packages = pacoteRows.map(mapPacoteRowToDispatchPackage);
      const allPackages = allPacoteRows.map(mapPacoteRowToDispatchPackage);

      if (!isCurrentRequest()) {
        return;
      }

      setState({
        ownerUserId: requestedUserId,
        catalogs: {
          stores: lojasRows.map(mapLojaRowToStore),
          marketplaces: marketplacesRows.map(mapMarketplaceRowToMarketplace),
          carriers: transportadorasRows.map(mapTransportadoraRowToCarrier),
        },
        packages,
        allPackages,
        batches: sessaoRows.map((row) => mapSessaoRowToDispatchBatch(row, allPackages)),
        movements: movementRows.map(mapMovimentacaoRowToPackageMovement),
        cancellations: cancellationRows.map(mapCancelamentoRowToPackageCancellation),
        loading: false,
        error: "",
      });
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }

      setState(
        createInitialState(
          false,
          formatDatabaseError(error),
          requestedUserId,
        ),
      );
    }
  }, [authLoading, userId]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        void reload();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [reload]);

  const visibleState = canDisplayAccountData(state.ownerUserId, userId)
    ? state
    : createInitialState(authLoading || Boolean(userId));

  return {
    ...visibleState,
    reload,
  };
}
