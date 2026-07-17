"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
): DispatchDataState {
  return {
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
  const reloadRequestIdRef = useRef(0);
  const [state, setState] = useState<DispatchDataState>(initialState);

  const reload = useCallback(async () => {
    const requestId = ++reloadRequestIdRef.current;
    const isCurrentRequest = () => requestId === reloadRequestIdRef.current;

    if (!isSupabaseConfigured()) {
      setState(createInitialState(false, SUPABASE_NOT_CONFIGURED_MESSAGE));
      return;
    }

    setState((current) => ({ ...current, loading: true, error: "" }));

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

      setState(createInitialState(false, formatDatabaseError(error)));
    }
  }, []);

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

  return {
    ...state,
    reload,
  };
}
