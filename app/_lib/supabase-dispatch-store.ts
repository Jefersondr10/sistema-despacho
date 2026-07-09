"use client";

import { useCallback, useEffect, useState } from "react";

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

const initialState: DispatchDataState = {
  catalogs: emptyCatalogs,
  packages: [],
  allPackages: [],
  batches: [],
  movements: [],
  cancellations: [],
  loading: true,
  error: "",
};

export function useSupabaseDispatchData() {
  const { loading: authLoading, user } = useAuth();
  const userId = user?.id ?? "";
  const [state, setState] = useState<DispatchDataState>(initialState);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setState({
        ...initialState,
        loading: false,
        error: SUPABASE_NOT_CONFIGURED_MESSAGE,
      });
      return;
    }

    if (authLoading) {
      setState((current) => ({ ...current, loading: true, error: "" }));
      return;
    }

    if (!userId) {
      setState({ ...initialState, loading: false });
      return;
    }

    setState((current) => ({ ...current, loading: true, error: "" }));

    try {
      const databaseContext = { userId };
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
        getLojas({ incluirInativos: true }, databaseContext),
        getMarketplaces({ incluirInativos: true }, databaseContext),
        getTransportadoras({ incluirInativos: true }, databaseContext),
        getPacotesComRelacionamentos(undefined, databaseContext),
        getPacotesComRelacionamentos(
          { incluirCancelados: true },
          databaseContext,
        ),
        getSessoesBipagemComRelacionamentos(undefined, databaseContext),
        getMovimentacoes(databaseContext),
        getPacotesCanceladosComRelacionamentos(undefined, databaseContext),
      ]);

      const packages = pacoteRows.map(mapPacoteRowToDispatchPackage);
      const allPackages = allPacoteRows.map(mapPacoteRowToDispatchPackage);

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
      setState((current) => ({
        ...current,
        loading: false,
        error: formatDatabaseError(error),
      }));
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

  useEffect(() => {
    setState(userId ? initialState : { ...initialState, loading: false });
  }, [userId]);

  return {
    ...state,
    reload,
  };
}
