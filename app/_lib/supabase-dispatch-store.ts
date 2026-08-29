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
  type DatabaseContext,
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
import { retrySupabaseReadForJwtClockSkew } from "@/lib/supabase-jwt-retry";

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

export type DispatchDataProfile =
  | "full"
  | "bipagem"
  | "dashboard"
  | "pacotes"
  | "cancelados"
  | "relatorios"
  | "romaneio";

export function useSupabaseDispatchData(
  profile: DispatchDataProfile = "full",
  sessionId?: string,
) {
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
      const databaseContext: DatabaseContext = { userId: requestedUserId };
      const loadActivePackages = [
        "full",
        "bipagem",
        "relatorios",
      ].includes(profile);
      const loadAllPackages = ["full", "bipagem"].includes(profile);
      const loadBatches = ["full", "bipagem", "romaneio"].includes(profile);
      const loadMovements = profile === "full";
      const loadCancellations = ["full", "bipagem", "cancelados"].includes(
        profile,
      );
      const loadRows = () =>
        Promise.all([
          getLojas({ incluirInativos: true }, databaseContext),
          getMarketplaces({ incluirInativos: true }, databaseContext),
          getTransportadoras({ incluirInativos: true }, databaseContext),
          loadActivePackages
            ? getPacotesComRelacionamentos(undefined, databaseContext)
            : Promise.resolve([]),
          loadAllPackages
            ? getPacotesComRelacionamentos(
                {
                  incluirCancelados: true,
                },
                databaseContext,
              )
            : Promise.resolve([]),
          loadBatches
            ? getSessoesBipagemComRelacionamentos(
                {
                  id: profile === "romaneio" ? sessionId : undefined,
                  incluirTotais: false,
                },
                databaseContext,
              )
            : Promise.resolve([]),
          loadMovements
            ? getMovimentacoes(undefined, databaseContext)
            : Promise.resolve([]),
          loadCancellations
            ? getPacotesCanceladosComRelacionamentos(undefined, databaseContext)
            : Promise.resolve([]),
        ]);
      const [
        lojasRows,
        marketplacesRows,
        transportadorasRows,
        pacoteRows,
        allPacoteRows,
        sessaoRows,
        movementRows,
        cancellationRows,
      ] = await retrySupabaseReadForJwtClockSkew(loadRows, {
        shouldContinue: isCurrentRequest,
      });

      const allPackages = allPacoteRows.map(mapPacoteRowToDispatchPackage);
      const packages = pacoteRows.map(mapPacoteRowToDispatchPackage);
      const packageTotalsBySession = new Map<string, number>();
      const packageRowsForTotals = allPacoteRows.length
        ? allPacoteRows
        : pacoteRows;
      for (const row of packageRowsForTotals) {
        if (!row.sessao_id || row.status === "cancelado") {
          continue;
        }

        packageTotalsBySession.set(
          row.sessao_id,
          (packageTotalsBySession.get(row.sessao_id) ?? 0) + 1,
        );
      }

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
        batches: sessaoRows.map((row) =>
          mapSessaoRowToDispatchBatch({
            ...row,
            total_pacotes: packageTotalsBySession.get(row.id) ?? 0,
          }),
        ),
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
  }, [authLoading, profile, sessionId, userId]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        void reload();
      }
    });

    return () => {
      cancelled = true;
      reloadRequestIdRef.current += 1;
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
