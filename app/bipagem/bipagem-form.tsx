"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  Badge,
  ConfirmDialog,
  EmptyState,
  FeedbackMessage,
  MelhorEnvioBadge,
  OperationBadge,
  StatusBadge,
} from "@/app/_components/ui";
import { SelectField } from "@/app/_components/select-field";
import {
  MobileCameraScanner,
  type CameraScanOutcome,
} from "@/app/bipagem/mobile-camera-scanner";
import { getOrCreateBipagemStationId } from "@/app/bipagem/bipagem-station";
import { parseTrackingCode } from "@/app/bipagem/tracking-code-policy";
import { useAccessibleFullscreenDialog } from "@/app/bipagem/use-accessible-fullscreen-dialog";
import type {
  DispatchPackage,
  OperationType,
  PackageCancellation,
} from "@/app/_lib/mock-data";
import {
  formatPackageDate,
  getOperationLabel,
  getSaoPauloDateString,
  normalizeTrackingCode,
} from "@/app/_lib/mock-data";
import { useAuth } from "@/app/_lib/auth-context";
import { useSupabaseDispatchData } from "@/app/_lib/supabase-dispatch-store";
import {
  adicionarItemSessaoBipagem,
  cancelarSessaoBipagemAberta,
  cancelarPacotes,
  createSessaoBipagem,
  finalizarCancelamentosEmLote,
  finalizarSessaoBipagemAberta,
  formatDatabaseError,
  getPacoteAtivoPorCodigo,
  getPacotesFinalizadosPorCodigo,
  getSessaoBipagemAbertaComItens,
  type ItemSessaoBipagemRow,
  mapItemSessaoRowToDispatchPackage,
  mapPacoteRowToDispatchPackage,
  removerItemSessaoBipagem,
} from "@/lib/database";

type Notice = {
  type: "success" | "warning" | "danger" | "neutral";
  text: string;
};

type FullscreenPackagesMode = "browse" | "manual-remove";

type PendingCancellationItem = {
  pacote: DispatchPackage;
  justificativa_individual: string;
};

const nowIso = () => new Date().toISOString();
const DUPLICATE_SESSION_WARNING =
  "Existem pacotes duplicados neste lote. Remova os duplicados para finalizar.";
const DUPLICATE_FINALIZE_MESSAGE =
  "Não é possível finalizar o lote com pacotes duplicados. Exclua os rastreios repetidos antes de finalizar.";

const BATCH_HISTORY_PAGE_SIZE = 8;
const BATCH_PACKAGE_PAGE_SIZE = 100;
const SESSION_PACKAGE_PAGE_SIZE = 200;

function mapPendingItemToPackage(
  item: ItemSessaoBipagemRow,
  {
    sessaoId,
    lojaId,
    marketplaceId,
    marketplace,
    melhorEnvio,
    transportadora,
    tipoOperacao,
  }: {
    sessaoId: string;
    lojaId: string;
    marketplaceId: string;
    marketplace: string;
    melhorEnvio: boolean;
    transportadora: string | null;
    tipoOperacao: OperationType;
  },
): DispatchPackage {
  return {
    id: item.id,
    lote_id: sessaoId,
    loja_id: lojaId,
    codigo_rastreio: item.codigo_normalizado,
    marketplace_id: marketplaceId,
    marketplace,
    melhor_envio: melhorEnvio,
    transportadora,
    tipo_operacao: tipoOperacao,
    status: "Pendente na sessão",
    data_hora_bipagem: item.criado_em,
    criado_em: item.criado_em,
  };
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function shouldAutoFocusCodeField() {
  return !window.matchMedia(
    "(max-width: 1279px) and (pointer: coarse)",
  ).matches;
}

export function BipagemForm() {
  const codeRef = useRef<HTMLInputElement>(null);
  const sessionListRef = useRef<HTMLDivElement>(null);
  const processingTrackingRef = useRef(false);
  const finishingSessionRef = useRef(false);
  const cancellationReasonRef = useRef<HTMLTextAreaElement>(null);
  const firstCancellationCandidateRef = useRef<HTMLButtonElement>(null);
  const cancellationPanelRef = useRef<HTMLFormElement>(null);
  const duplicateManagerRef = useRef<HTMLElement>(null);
  const duplicateManagerInitialFocusRef = useRef<HTMLButtonElement>(null);
  const fullscreenPackagesRef = useRef<HTMLElement>(null);
  const fullscreenPackagesInitialFocusRef = useRef<HTMLButtonElement>(null);
  const manualPackageRemovalInputRef = useRef<HTMLInputElement>(null);
  const mobileBatchHistoryRef = useRef<HTMLElement>(null);
  const mobileBatchHistoryInitialFocusRef = useRef<HTMLButtonElement>(null);
  const mobileSessionOptionsTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileSessionOptionsRef = useRef<HTMLElement>(null);
  const mobileSessionOptionsInitialFocusRef = useRef<HTMLButtonElement>(null);
  const mobileImmersiveRef = useRef<HTMLElement>(null);
  const { user } = useAuth();
  const {
    catalogs,
    allPackages,
    batches,
    loading,
    error,
    reload,
  } = useSupabaseDispatchData("bipagem");
  const [lojaId, setLojaId] = useState("");
  const [marketplaceId, setMarketplaceId] = useState("");
  const [tipoOperacao, setTipoOperacao] = useState<OperationType | "">("");
  const [melhorEnvio, setMelhorEnvio] = useState(false);
  const [transportadora, setTransportadora] = useState("");
  const [activeBatchId, setActiveBatchId] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sessionPackages, setSessionPackages] = useState<DispatchPackage[]>([]);
  const [selectedHistoryBatchId, setSelectedHistoryBatchId] = useState("");
  const [cancellationMode, setCancellationMode] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationCandidates, setCancellationCandidates] = useState<
    DispatchPackage[]
  >([]);
  const [recentCancellations, setRecentCancellations] = useState<
    PackageCancellation[]
  >([]);
  const [pendingCancellations, setPendingCancellations] = useState<
    PendingCancellationItem[]
  >([]);
  const [loadingOpenSession, setLoadingOpenSession] = useState(true);
  const [showClearSessionConfirm, setShowClearSessionConfirm] = useState(false);
  const [showDuplicateFinalizeDialog, setShowDuplicateFinalizeDialog] =
    useState(false);
  const [showExitCancellationConfirm, setShowExitCancellationConfirm] =
    useState(false);
  const [showFinalizeCancellationConfirm, setShowFinalizeCancellationConfirm] =
    useState(false);
  const [pendingSessionCancelPackage, setPendingSessionCancelPackage] =
    useState<DispatchPackage | null>(null);
  const [sessionCancelReason, setSessionCancelReason] = useState("");
  const [sessionCancelError, setSessionCancelError] = useState("");
  const [checkingPackage, setCheckingPackage] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [savingCancellation, setSavingCancellation] = useState(false);
  const [visibleBatchCount, setVisibleBatchCount] = useState(
    BATCH_HISTORY_PAGE_SIZE,
  );
  const [visibleSelectedBatchPackageCount, setVisibleSelectedBatchPackageCount] =
    useState(BATCH_PACKAGE_PAGE_SIZE);
  const [visibleSessionPackageCount, setVisibleSessionPackageCount] = useState(
    SESSION_PACKAGE_PAGE_SIZE,
  );
  const [showOnlySessionDuplicates, setShowOnlySessionDuplicates] =
    useState(false);
  const [showMobileManualInput, setShowMobileManualInput] = useState(false);
  const [mobileScanningStarted, setMobileScanningStarted] = useState(false);
  const [showMobileSessionOptions, setShowMobileSessionOptions] =
    useState(false);
  const [showFullscreenSessionPackages, setShowFullscreenSessionPackages] =
    useState(false);
  const [fullscreenPackagesMode, setFullscreenPackagesMode] =
    useState<FullscreenPackagesMode>("browse");
  const [manualPackageRemovalQuery, setManualPackageRemovalQuery] =
    useState("");
  const [showMobileBatchHistory, setShowMobileBatchHistory] = useState(false);
  const [sessionPackageActionError, setSessionPackageActionError] =
    useState("");
  const [sessionPackageActionStatus, setSessionPackageActionStatus] =
    useState("");
  const [stationIdentity, setStationIdentity] = useState<{
    userId: string;
    id: string;
  } | null>(null);
  const [stationError, setStationError] = useState("");

  const databaseContext = useMemo(
    () => ({ userId: user?.id }),
    [user?.id],
  );
  const stationId =
    stationIdentity && stationIdentity.userId === user?.id
      ? stationIdentity.id
      : "";

  const activeStores = useMemo(
    () => catalogs.stores.filter((item) => item.status !== "Inativa"),
    [catalogs.stores],
  );
  const activeMarketplaces = useMemo(
    () =>
      catalogs.marketplaces.filter((item) => item.status !== "Inativo"),
    [catalogs.marketplaces],
  );
  const activeCarriers = useMemo(
    () => catalogs.carriers.filter((item) => item.status !== "Inativa"),
    [catalogs.carriers],
  );
  const sessionOpen = Boolean(activeBatchId);
  const mobileImmersiveSession =
    (sessionOpen || mobileScanningStarted) && !cancellationMode;
  const selectedLojaId =
    lojaId && (sessionOpen || activeStores.some((item) => item.id === lojaId))
      ? lojaId
      : "";
  const selectedMarketplaceItem = catalogs.marketplaces.find(
    (item) =>
      item.id === marketplaceId &&
      (sessionOpen || activeMarketplaces.some((active) => active.id === item.id)),
  );
  const selectedMarketplaceId = selectedMarketplaceItem?.id ?? "";
  const selectedMarketplace = selectedMarketplaceItem?.name ?? "";
  const selectedCarrierItem = activeCarriers.find(
    (item) => item.name === transportadora,
  );
  const configLocked = sessionOpen || cancellationMode;
  const sortedBatches = useMemo(
    () =>
      batches
        .filter((batch) => batch.status === "finalizada")
        .filter((batch) => batch.id !== activeBatchId)
        .sort((a, b) =>
          (b.finalizado_em ?? b.criado_em).localeCompare(
            a.finalizado_em ?? a.criado_em,
          ),
        ),
    [activeBatchId, batches],
  );
  const selectedBatch = sortedBatches.find(
    (batch) => batch.id === selectedHistoryBatchId,
  );
  const packagesByBatchId = useMemo(() => {
    const packageGroups = new Map<string, DispatchPackage[]>();

    for (const item of allPackages) {
      const batchPackages = packageGroups.get(item.lote_id) ?? [];
      batchPackages.push(item);
      packageGroups.set(item.lote_id, batchPackages);
    }

    return packageGroups;
  }, [allPackages]);
  const selectedBatchPackages = useMemo(
    () =>
      selectedBatch ? packagesByBatchId.get(selectedBatch.id) ?? [] : [],
    [packagesByBatchId, selectedBatch],
  );
  const visibleBatches = useMemo(
    () => sortedBatches.slice(0, visibleBatchCount),
    [sortedBatches, visibleBatchCount],
  );
  const visibleSelectedBatchPackages = useMemo(
    () => selectedBatchPackages.slice(0, visibleSelectedBatchPackageCount),
    [selectedBatchPackages, visibleSelectedBatchPackageCount],
  );
  const sessionCodeCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const item of sessionPackages) {
      const normalizedCode = normalizeTrackingCode(item.codigo_rastreio);
      counts.set(normalizedCode, (counts.get(normalizedCode) ?? 0) + 1);
    }

    return counts;
  }, [sessionPackages]);
  const sessionNormalizedCodes = useMemo(
    () => new Set(sessionCodeCounts.keys()),
    [sessionCodeCounts],
  );
  const duplicateSessionCodes = useMemo(
    () =>
      new Set(
        Array.from(sessionCodeCounts)
          .filter(([, count]) => count > 1)
          .map(([code]) => code),
      ),
    [sessionCodeCounts],
  );
  const duplicateSessionCodeList = useMemo(
    () => Array.from(duplicateSessionCodes).sort(),
    [duplicateSessionCodes],
  );
  const hasSessionDuplicates = duplicateSessionCodes.size > 0;
  const duplicateExcessCount = useMemo(
    () =>
      Array.from(sessionCodeCounts.values()).reduce(
        (total, count) => total + Math.max(0, count - 1),
        0,
      ),
    [sessionCodeCounts],
  );
  const latestSessionPackage = sessionPackages[0] ?? null;
  const duplicateSessionPackages = useMemo(
    () =>
      sessionPackages.filter((item) =>
        duplicateSessionCodes.has(
          normalizeTrackingCode(item.codigo_rastreio),
        ),
      ),
    [duplicateSessionCodes, sessionPackages],
  );
  const sessionPackageNumbers = useMemo(
    () =>
      new Map(
        sessionPackages.map((item, index) => [
          item.id,
          sessionPackages.length - index,
        ]),
      ),
    [sessionPackages],
  );
  const filteredSessionPackages = useMemo(
    () =>
      showOnlySessionDuplicates
        ? duplicateSessionPackages
        : sessionPackages,
    [duplicateSessionPackages, sessionPackages, showOnlySessionDuplicates],
  );
  const visibleSessionPackages = useMemo(
    () => filteredSessionPackages.slice(0, visibleSessionPackageCount),
    [filteredSessionPackages, visibleSessionPackageCount],
  );
  const fullscreenSessionPackages = useMemo(() => {
    if (fullscreenPackagesMode !== "manual-remove") {
      return sessionPackages;
    }

    const normalizedQuery = normalizeTrackingCode(manualPackageRemovalQuery);
    if (!normalizedQuery) {
      return [];
    }

    return sessionPackages.filter((item) =>
      normalizeTrackingCode(item.codigo_rastreio).includes(normalizedQuery),
    );
  }, [
    fullscreenPackagesMode,
    manualPackageRemovalQuery,
    sessionPackages,
  ]);
  const manualPackageRemovalHasQuery = Boolean(
    normalizeTrackingCode(manualPackageRemovalQuery),
  );
  const submitDisabled =
    loading ||
    loadingOpenSession ||
    savingCancellation ||
    savingSession ||
    checkingPackage ||
    cancellationCandidates.length > 0;
  const finalizeDisabled =
    hasSessionDuplicates ||
    loading ||
    loadingOpenSession ||
    savingSession ||
    checkingPackage;
  const sessionMutationLocked =
    savingSession || savingCancellation || checkingPackage;
  const cameraDisabledMessage = stationError
    ? stationError
    : !stationId
      ? "Preparando este aparelho para uma bipagem independente."
      : loading || loadingOpenSession
        ? "Aguarde o carregamento dos dados."
        : !selectedLojaId
          ? "Selecione a loja para liberar a câmera."
          : !selectedMarketplace
            ? "Selecione o marketplace para liberar a câmera."
            : !tipoOperacao
              ? "Selecione Coleta ou Postagem para liberar a câmera."
              : melhorEnvio && !transportadora
                ? "Selecione a transportadora para liberar a câmera."
                : error
                  ? "Corrija o erro de carregamento antes de usar a câmera."
                  : "";
  const cameraPaused =
    showClearSessionConfirm ||
    showDuplicateFinalizeDialog ||
    showExitCancellationConfirm ||
    showFinalizeCancellationConfirm ||
    Boolean(pendingSessionCancelPackage) ||
    Boolean(selectedBatch) ||
    showOnlySessionDuplicates ||
    showFullscreenSessionPackages ||
    showMobileBatchHistory ||
    showMobileSessionOptions ||
    showMobileManualInput ||
    cancellationCandidates.length > 0;

  useAccessibleFullscreenDialog({
    open: showOnlySessionDuplicates,
    dialogRef: duplicateManagerRef,
    initialFocusRef: duplicateManagerInitialFocusRef,
    onClose: closeDuplicatePackages,
  });

  useAccessibleFullscreenDialog({
    open: showFullscreenSessionPackages && mobileImmersiveSession,
    dialogRef: fullscreenPackagesRef,
    initialFocusRef:
      fullscreenPackagesMode === "manual-remove"
        ? manualPackageRemovalInputRef
        : fullscreenPackagesInitialFocusRef,
    onClose: closeFullscreenSessionPackages,
  });

  useAccessibleFullscreenDialog({
    open: showMobileSessionOptions && mobileImmersiveSession,
    dialogRef: mobileSessionOptionsRef,
    initialFocusRef: mobileSessionOptionsInitialFocusRef,
    onClose: closeMobileSessionOptions,
  });

  useAccessibleFullscreenDialog({
    open: showMobileBatchHistory && mobileImmersiveSession,
    dialogRef: mobileBatchHistoryRef,
    initialFocusRef: mobileBatchHistoryInitialFocusRef,
    onClose: selectedBatch
      ? closeBatchFromMobileHistory
      : closeMobileBatchHistory,
  });

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      try {
        const id = getOrCreateBipagemStationId({
          storage: window.localStorage,
          randomUUID: () => window.crypto.randomUUID(),
        });

        setStationError("");
        setStationIdentity({ userId: user.id, id });
      } catch (stationIdentificationError) {
        const message =
          stationIdentificationError instanceof Error
            ? stationIdentificationError.message
            : "Não foi possível identificar este aparelho para a bipagem.";
        setStationError(message);
        setLoadingOpenSession(false);
        setNotice({ type: "danger", text: message });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (loading || !stationId) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setLoadingOpenSession(true);

      void getSessaoBipagemAbertaComItens(stationId, databaseContext)
        .then((openSession) => {
        if (cancelled) {
          return;
        }

        if (!openSession) {
          setLoadingOpenSession(false);
          return;
        }

        const { sessao, itens } = openSession;
        setLojaId(sessao.loja_id);
        setMarketplaceId(sessao.marketplace_id);
        setTipoOperacao(sessao.tipo_operacao);
        setMelhorEnvio(sessao.melhor_envio);
        setTransportadora(sessao.transportadora?.nome ?? "");
        setActiveBatchId(sessao.id);
        setSessionPackages(
          itens.map((item) => mapItemSessaoRowToDispatchPackage(item, sessao)),
        );
        setNotice({
          type: "neutral",
          text: "Lote em andamento restaurado do Supabase.",
        });
        setLoadingOpenSession(false);
        })
        .catch((openSessionError) => {
        if (cancelled) {
          return;
        }

        setNotice({
          type: "danger",
          text: `Erro ao carregar lote em andamento: ${formatDatabaseError(
            openSessionError,
          )}`,
        });
        setLoadingOpenSession(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [databaseContext, loading, stationId]);

  useEffect(() => {
    if (
      !loading &&
      !loadingOpenSession &&
      shouldAutoFocusCodeField()
    ) {
      const focusTimer = window.setTimeout(
        () => codeRef.current?.focus({ preventScroll: true }),
        0,
      );

      return () => window.clearTimeout(focusTimer);
    }
  }, [loading, loadingOpenSession]);

  useEffect(() => {
    const hasCancellationDraft =
      cancellationMode &&
      (Boolean(cancellationReason.trim()) || pendingCancellations.length > 0);

    if (!hasCancellationDraft) {
      return;
    }

    function preventAccidentalExit(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", preventAccidentalExit);
    return () => window.removeEventListener("beforeunload", preventAccidentalExit);
  }, [cancellationMode, cancellationReason, pendingCancellations.length]);

  useEffect(() => {
    if (!cancellationCandidates.length) {
      return;
    }

    window.setTimeout(
      () => firstCancellationCandidateRef.current?.focus({ preventScroll: true }),
      0,
    );
  }, [cancellationCandidates.length]);

  function getCatalogStoreName(id: string) {
    return catalogs.stores.find((store) => store.id === id)?.name ?? id;
  }

  function getBatchCode(batch: { id: string; codigo_lote?: string | null }) {
    return batch.codigo_lote || `LOTE-${batch.id.slice(0, 8).toUpperCase()}`;
  }

  function openStoreRomaneio(batch: {
    loja_id: string;
    marketplace: string;
    finalizado_em: string | null;
    criado_em: string;
  }) {
    const params = new URLSearchParams({
      modo: "romaneio",
      lojaId: batch.loja_id,
      marketplace: batch.marketplace,
      data: getSaoPauloDateString(batch.finalizado_em ?? batch.criado_em),
    });

    window.open(
      `/relatorios?${params.toString()}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function openBatchHistory(batchId: string) {
    setVisibleSelectedBatchPackageCount(BATCH_PACKAGE_PAGE_SIZE);
    setSelectedHistoryBatchId(batchId);
  }

  function getMarketplaceIdByName(name: string) {
    return (
      catalogs.marketplaces.find(
        (item) => item.name === name || item.id === name,
      )?.id ?? null
    );
  }

  function getCarrierIdByName(name: string | null) {
    if (!name) {
      return null;
    }

    return (
      catalogs.carriers.find((item) => item.name === name || item.id === name)
        ?.id ?? null
    );
  }

  function getCodeFieldValue() {
    return codeRef.current?.value.trim() ?? "";
  }

  function clearCodeField() {
    if (codeRef.current) {
      codeRef.current.value = "";
    }
  }

  function focusCodeField(force = cancellationMode) {
    if (!force && !shouldAutoFocusCodeField()) {
      return;
    }

    const currentCodeField = codeRef.current;
    currentCodeField?.focus({ preventScroll: true });
    window.setTimeout(
      () => codeRef.current?.focus({ preventScroll: true }),
      0,
    );
  }

  function openMobileManualEntry() {
    setShowMobileSessionOptions(false);
    flushSync(() => setShowMobileManualInput(true));
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() =>
        codeRef.current?.focus({ preventScroll: true }),
      ),
    );
  }

  function startMobileScanning() {
    if (cameraDisabledMessage || submitDisabled) {
      setNotice({
        type: "warning",
        text:
          cameraDisabledMessage ||
          "Aguarde o carregamento terminar para iniciar a bipagem.",
      });
      return;
    }

    clearCodeField();
    setShowMobileManualInput(false);
    setNotice(null);
    setMobileScanningStarted(true);
    window.requestAnimationFrame(() =>
      mobileImmersiveRef.current?.focus({ preventScroll: true }),
    );
  }

  function showDuplicatePackages() {
    setShowMobileSessionOptions(false);
    setSessionPackageActionError("");
    setSessionPackageActionStatus("");
    setShowOnlySessionDuplicates(true);
    setVisibleSessionPackageCount(SESSION_PACKAGE_PAGE_SIZE);
    window.requestAnimationFrame(() =>
      sessionListRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }

  function closeDuplicatePackages() {
    setShowOnlySessionDuplicates(false);
    setSessionPackageActionError("");
    setSessionPackageActionStatus("");
    setVisibleSessionPackageCount(SESSION_PACKAGE_PAGE_SIZE);
    setNotice({
      type: hasSessionDuplicates ? "warning" : "neutral",
      text: hasSessionDuplicates
        ? "A correção foi pausada. Ainda existem duplicados neste lote."
        : "Duplicados corrigidos. A bipagem foi liberada.",
    });
    focusCodeField();
  }

  function closeMobileSessionOptions() {
    setShowMobileSessionOptions(false);
  }

  function openFullscreenSessionPackages() {
    setShowMobileSessionOptions(false);
    setSessionPackageActionError("");
    setSessionPackageActionStatus("");
    setFullscreenPackagesMode("browse");
    setManualPackageRemovalQuery("");
    setShowFullscreenSessionPackages(true);
  }

  function openManualPackageRemoval() {
    if (
      !sessionPackages.length ||
      processingTrackingRef.current ||
      sessionMutationLocked
    ) {
      return;
    }

    setShowMobileSessionOptions(false);
    setSessionPackageActionError("");
    setSessionPackageActionStatus("");
    setManualPackageRemovalQuery("");
    setFullscreenPackagesMode("manual-remove");
    setShowFullscreenSessionPackages(true);
  }

  function closeFullscreenSessionPackages() {
    setShowFullscreenSessionPackages(false);
    setFullscreenPackagesMode("browse");
    setManualPackageRemovalQuery("");
    setSessionPackageActionError("");
    setSessionPackageActionStatus("");
    window.requestAnimationFrame(() =>
      mobileSessionOptionsTriggerRef.current?.focus({ preventScroll: true }),
    );
  }

  function openMobileBatchHistory() {
    if (processingTrackingRef.current || sessionMutationLocked) {
      return;
    }

    setShowMobileSessionOptions(false);
    setSelectedHistoryBatchId("");
    setVisibleSelectedBatchPackageCount(BATCH_PACKAGE_PAGE_SIZE);
    setShowMobileBatchHistory(true);
  }

  function closeMobileBatchHistory() {
    setShowMobileBatchHistory(false);
    setSelectedHistoryBatchId("");
    setVisibleSelectedBatchPackageCount(BATCH_PACKAGE_PAGE_SIZE);
    window.requestAnimationFrame(() =>
      mobileSessionOptionsTriggerRef.current?.focus({ preventScroll: true }),
    );
  }

  function openBatchFromMobileHistory(batchId: string) {
    openBatchHistory(batchId);
    window.requestAnimationFrame(() =>
      mobileBatchHistoryInitialFocusRef.current?.focus({ preventScroll: true }),
    );
  }

  function closeBatchFromMobileHistory() {
    setSelectedHistoryBatchId("");
    setVisibleSelectedBatchPackageCount(BATCH_PACKAGE_PAGE_SIZE);
    window.requestAnimationFrame(() =>
      mobileBatchHistoryInitialFocusRef.current?.focus({ preventScroll: true }),
    );
  }

  function cancelSessionPackageFromFullscreen(item: DispatchPackage) {
    setShowFullscreenSessionPackages(false);
    setSessionPackageActionError("");
    cancelSessionPackage(item);
  }

  function discardSessionFromMobileOptions() {
    if (
      processingTrackingRef.current ||
      finishingSessionRef.current ||
      sessionMutationLocked
    ) {
      setNotice({
        type: "warning",
        text: "Aguarde a leitura ou alteração atual terminar.",
      });
      return;
    }

    setShowMobileSessionOptions(false);

    if (!activeBatchId) {
      setShowMobileManualInput(false);
      setMobileScanningStarted(false);
      setNotice({
        type: "neutral",
        text: "Bipagem encerrada antes da primeira leitura.",
      });
      return;
    }

    clearSession();
  }

  function resetSessionConfig() {
    setSessionPackages([]);
    setActiveBatchId("");
    setLojaId("");
    setMarketplaceId("");
    setTipoOperacao("");
    setMelhorEnvio(false);
    setTransportadora("");
    setVisibleSessionPackageCount(SESSION_PACKAGE_PAGE_SIZE);
    setShowOnlySessionDuplicates(false);
    setShowMobileManualInput(false);
    setMobileScanningStarted(false);
    setShowMobileSessionOptions(false);
    setShowFullscreenSessionPackages(false);
    setFullscreenPackagesMode("browse");
    setManualPackageRemovalQuery("");
    setShowMobileBatchHistory(false);
    setSessionPackageActionError("");
    setSessionPackageActionStatus("");
    clearCodeField();
  }

  function handleMelhorEnvioChange(active: boolean) {
    if (configLocked) {
      return;
    }

    setMelhorEnvio(active);
    setTransportadora("");
    focusCodeField();
  }

  function makeCancellationRecord({
    item,
    generalReason,
    individualReason,
    canceledAt = nowIso(),
  }: {
    item: DispatchPackage;
    generalReason: string;
    individualReason: string;
    canceledAt?: string;
  }): PackageCancellation {
    return {
      id: makeId("can"),
      pacote_id: item.id,
      loja_id: item.loja_id,
      loja_nome: getCatalogStoreName(item.loja_id),
      sessao_id: item.lote_id,
      codigo_pacote: item.codigo_rastreio,
      marketplace: item.marketplace,
      tipo_operacao: item.tipo_operacao,
      melhor_envio: item.melhor_envio,
      transportadora: item.transportadora,
      data_hora_bipagem: item.data_hora_bipagem,
      cancelado_em: canceledAt,
      justificativa_geral: generalReason,
      justificativa_individual: individualReason,
      criado_em: canceledAt,
    };
  }

  function validateSessionConfig(code: string) {
    if (!selectedLojaId) {
      return "Selecione a loja antes de iniciar o lote.";
    }

    if (!selectedMarketplace) {
      return "Selecione o marketplace antes de iniciar o lote.";
    }

    if (!tipoOperacao) {
      return "Selecione Coleta ou Postagem antes de bipar.";
    }

    if (!code) {
      return "Informe ou bipe o código do pacote.";
    }

    if (melhorEnvio && !transportadora) {
      return "Selecione a transportadora para Melhor Envio.";
    }

    return "";
  }

  function reportTrackingOutcome(
    tone: CameraScanOutcome["tone"],
    message: string,
    accepted = false,
    code?: string,
  ): CameraScanOutcome {
    setNotice({ type: tone, text: message });
    return { tone, message, accepted, code };
  }

  async function ensureOpenSession(selectedOperation: OperationType) {
    if (activeBatchId) {
      return activeBatchId;
    }

    if (!selectedMarketplaceItem) {
      throw new Error("Marketplace nao encontrado nos cadastros.");
    }

    if (melhorEnvio && !selectedCarrierItem) {
      throw new Error("Transportadora nao encontrada nos cadastros.");
    }

    if (!stationId) {
      throw new Error("Este aparelho ainda não está pronto para iniciar o lote.");
    }

    const timestamp = nowIso();
    const sessao = await createSessaoBipagem(
      {
        estacao_id: stationId,
        loja_id: selectedLojaId,
        marketplace_id: selectedMarketplaceItem.id,
        tipo_operacao: selectedOperation,
        melhor_envio: melhorEnvio,
        transportadora_id: melhorEnvio ? selectedCarrierItem?.id ?? null : null,
        status: "aberta",
        iniciada_em: timestamp,
      },
      databaseContext,
    );

    setActiveBatchId(sessao.id);

    return sessao.id;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const outcome = await processTrackingCode(getCodeFieldValue());
    if (!cancellationMode && outcome.accepted) {
      setShowMobileManualInput(false);
    }
  }

  async function processTrackingCode(
    rawCode: string,
  ): Promise<CameraScanOutcome> {
    if (processingTrackingRef.current || finishingSessionRef.current) {
      return {
        tone: "warning",
        message: "Aguarde o pacote anterior terminar de processar.",
        accepted: false,
      } satisfies CameraScanOutcome;
    }

    processingTrackingRef.current = true;

    try {

    if (cancellationCandidates.length) {
      firstCancellationCandidateRef.current?.focus({ preventScroll: true });
      return {
        tone: "warning",
        message: "Escolha o pacote pendente antes de continuar.",
        accepted: false,
      } satisfies CameraScanOutcome;
    }

    const rawValue = rawCode.trim();
    if (cancellationMode) {
      await cancelPackageByCode(rawValue);
      return {
        tone: "success",
        message: "Código processado na lista de cancelamento.",
        accepted: true,
      } satisfies CameraScanOutcome;
    }

    const validationMessage = validateSessionConfig(rawValue);
    if (validationMessage) {
      const outcome = reportTrackingOutcome("warning", validationMessage);
      focusCodeField();
      return outcome;
    }

    const parsedCode = parseTrackingCode(rawValue, {
      carrier: selectedCarrierItem?.service ?? transportadora,
    });
    if (!parsedCode.accepted) {
      const outcome = reportTrackingOutcome("warning", parsedCode.message);
      clearCodeField();
      focusCodeField();
      return outcome;
    }

    const selectedOperation = tipoOperacao as OperationType;
    const normalizedCode = normalizeTrackingCode(parsedCode.code);
    const duplicatedInSession = sessionNormalizedCodes.has(normalizedCode);

    let duplicatedSavedPackage = null;
    setCheckingPackage(true);
    try {
      duplicatedSavedPackage = await getPacoteAtivoPorCodigo(
        normalizedCode,
        { loja_id: selectedLojaId },
        databaseContext,
      );
    } catch (error) {
      const outcome = reportTrackingOutcome(
        "danger",
        `Erro ao verificar duplicidade: ${formatDatabaseError(error)}`,
      );
      focusCodeField();
      return outcome;
    } finally {
      setCheckingPackage(false);
    }

    if (duplicatedSavedPackage) {
      const outcome = reportTrackingOutcome(
        "danger",
        "Pacote duplicado: este código já foi bipado em outro lote.",
      );
      clearCodeField();
      focusCodeField();
      return outcome;
    }

    setSavingSession(true);

    try {
      const sessaoId = await ensureOpenSession(selectedOperation);
      const itens = await adicionarItemSessaoBipagem(
        {
          sessao_id: sessaoId,
          codigo: normalizedCode,
        },
        databaseContext,
      );
      const addedItem = itens[0];

      if (!addedItem) {
        throw new Error("O pacote foi salvo, mas o lote não retornou o item.");
      }

      let serverDetectedDuplicate = addedItem.duplicado;
      if (addedItem.duplicado || duplicatedInSession) {
        // A duplicidade e rara. Somente nesse caminho sincronizamos a sessao
        // inteira para mostrar itens adicionados por outra aba/leitor.
        const openSession = await getSessaoBipagemAbertaComItens(
          stationId,
          databaseContext,
        );
        if (!openSession || openSession.sessao.id !== sessaoId) {
          throw new Error("O lote foi alterado em outro dispositivo. Recarregue a tela.");
        }
        serverDetectedDuplicate = openSession.itens.some((item) => item.duplicado);
        setSessionPackages(
          openSession.itens.map((item) =>
            mapItemSessaoRowToDispatchPackage(item, openSession.sessao),
          ),
        );
      } else {
        const addedPackage = mapPendingItemToPackage(addedItem, {
          sessaoId,
          lojaId: selectedLojaId,
          marketplaceId: selectedMarketplaceId,
          marketplace: selectedMarketplace,
          melhorEnvio,
          transportadora: melhorEnvio ? transportadora : null,
          tipoOperacao: selectedOperation,
        });
        setSessionPackages((current) => [
          addedPackage,
          ...current.filter((item) => item.id !== addedPackage.id),
        ]);
      }
      const outcome = reportTrackingOutcome(
        duplicatedInSession || serverDetectedDuplicate ? "danger" : "success",
        duplicatedInSession || serverDetectedDuplicate
          ? DUPLICATE_SESSION_WARNING
          : sessionOpen
            ? `Rastreio ${normalizedCode} adicionado ao lote.`
            : `Lote iniciado. Rastreio ${normalizedCode} adicionado.`,
        true,
        normalizedCode,
      );
      clearCodeField();
      return outcome;
    } catch (error) {
      return reportTrackingOutcome(
        "danger",
        `Erro ao salvar pacote no lote: ${formatDatabaseError(error)}`,
      );
    } finally {
      setSavingSession(false);
      focusCodeField();
    }
    } finally {
      processingTrackingRef.current = false;
    }
  }

  async function finishSession() {
    if (
      savingSession ||
      processingTrackingRef.current ||
      finishingSessionRef.current
    ) {
      return;
    }

    if (!sessionPackages.length || !activeBatchId) {
      setNotice({ type: "warning", text: "Nenhum pacote para finalizar." });
      focusCodeField();
      return;
    }

    if (hasSessionDuplicates) {
      setNotice({ type: "danger", text: DUPLICATE_SESSION_WARNING });
      setShowDuplicateFinalizeDialog(true);
      focusCodeField();
      return;
    }

    finishingSessionRef.current = true;
    setSavingSession(true);

    try {
      // Confere a lista imediatamente antes da finalizacao. Isso impede que
      // uma segunda aba esconda itens ou duplicidades desta tela.
      const openSession = await getSessaoBipagemAbertaComItens(
        stationId,
        databaseContext,
      );
      if (!openSession || openSession.sessao.id !== activeBatchId) {
        throw new Error("O lote em andamento mudou em outro dispositivo. Recarregue a tela.");
      }
      const synchronizedPackages = openSession.itens.map((item) =>
        mapItemSessaoRowToDispatchPackage(item, openSession.sessao),
      );
      setSessionPackages(synchronizedPackages);

      const synchronizedDuplicates = new Set<string>();
      const synchronizedCounts = new Map<string, number>();
      for (const item of openSession.itens) {
        const code = item.codigo_normalizado;
        const count = (synchronizedCounts.get(code) ?? 0) + 1;
        synchronizedCounts.set(code, count);
        if (item.duplicado || count > 1) {
          synchronizedDuplicates.add(code);
        }
      }

      if (synchronizedDuplicates.size) {
        setShowDuplicateFinalizeDialog(true);
        throw new Error(DUPLICATE_SESSION_WARNING);
      }

      const result = await finalizarSessaoBipagemAberta(
        activeBatchId,
        databaseContext,
      );
      await reload();

      const batchCode = result?.codigo_lote || getBatchCode({ id: activeBatchId });
      setNotice({
        type: "success",
        text: `${result?.total_pacotes ?? sessionPackages.length} pacotes finalizados no lote ${batchCode}.`,
      });
      openBatchHistory(activeBatchId);
      resetSessionConfig();
    } catch (error) {
      setNotice({
        type: "danger",
        text: `Erro ao finalizar o lote: ${formatDatabaseError(error)}`,
      });
    } finally {
      finishingSessionRef.current = false;
      setSavingSession(false);
      focusCodeField();
    }
  }

  function clearSession() {
    if (
      finishingSessionRef.current ||
      processingTrackingRef.current ||
      sessionMutationLocked
    ) {
      setNotice({
        type: "warning",
        text: "Aguarde a leitura ou alteração atual terminar.",
      });
      return;
    }

    if (!activeBatchId) {
      setNotice({ type: "neutral", text: "O lote já está vazio." });
      focusCodeField();
      return;
    }

    setShowClearSessionConfirm(true);
  }

  async function confirmClearSession() {
    if (
      !activeBatchId ||
      savingSession ||
      checkingPackage ||
      processingTrackingRef.current
    ) {
      return;
    }

    setSavingSession(true);

    try {
      await cancelarSessaoBipagemAberta(activeBatchId, databaseContext);
      await reload();
      resetSessionConfig();
      setShowClearSessionConfirm(false);
      setNotice({ type: "neutral", text: "Lote atual descartado." });
    } catch (error) {
      setShowClearSessionConfirm(false);
      setNotice({
        type: "danger",
        text: `Erro ao descartar lote: ${formatDatabaseError(error)}`,
      });
    } finally {
      setSavingSession(false);
      focusCodeField();
    }
  }

  function requestCancellationMode() {
    if (loading || loadingOpenSession || savingSession || checkingPackage) {
      setNotice({
        type: "warning",
        text: "Aguarde o lote atual terminar de carregar ou salvar.",
      });
      return;
    }

    if (sessionPackages.length || sessionOpen) {
      setNotice({
        type: "warning",
        text: "Finalize ou descarte o lote atual antes de cancelar pacotes finalizados.",
      });
      focusCodeField();
      return;
    }

    activateCancellationMode();
  }

  function activateCancellationMode() {
    setMobileScanningStarted(false);
    setCancellationMode(true);
    clearCodeField();
    setNotice({
      type: "warning",
      text: "Cancelamento em lote aberto. Bipe os rastreios e informe o motivo geral ao finalizar.",
    });
    focusCodeField(true);
    window.setTimeout(
      () =>
        cancellationPanelRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      0,
    );
  }

  function requestExitCancellationMode() {
    if (savingCancellation) {
      return;
    }

    if (
      getCodeFieldValue() ||
      cancellationReason.trim() ||
      pendingCancellations.length
    ) {
      setShowExitCancellationConfirm(true);
      return;
    }

    exitCancellationMode();
  }

  function exitCancellationMode() {
    setCancellationMode(false);
    setShowExitCancellationConfirm(false);
    setShowFinalizeCancellationConfirm(false);
    clearCodeField();
    setCancellationCandidates([]);
    setCancellationReason("");
    setPendingCancellations([]);
    setNotice({ type: "neutral", text: "Cancelamento em lote fechado." });
    focusCodeField(false);
  }

  async function cancelPackageByCode(code: string) {
    if (savingCancellation || checkingPackage) {
      return;
    }

    if (!code) {
      setNotice({
        type: "warning",
        text: "Bipe ou digite o código do pacote que deseja cancelar.",
      });
      focusCodeField();
      return;
    }

    const normalizedCode = normalizeTrackingCode(code);
    let awaitingChoice = false;
    setCheckingPackage(true);

    try {
      const rows = await getPacotesFinalizadosPorCodigo(
        normalizedCode,
        databaseContext,
      );
      const matches = rows.map(mapPacoteRowToDispatchPackage);
      const queuedIds = new Set(
        pendingCancellations.map((item) => item.pacote.id),
      );
      const availableMatches = matches.filter((item) => !queuedIds.has(item.id));

      if (!matches.length) {
        setNotice({
          type: "danger",
          text: "Pacote finalizado não encontrado. Verifique o código ou se ele já foi cancelado.",
        });
        clearCodeField();
        return;
      }

      if (!availableMatches.length) {
        setNotice({
          type: "warning",
          text: "Este pacote já está na lista temporária de cancelamento.",
        });
        clearCodeField();
        return;
      }

      if (matches.length > 1) {
        awaitingChoice = true;
        setCancellationCandidates(availableMatches);
        setNotice({
          type: "warning",
          text: "O mesmo rastreio existe em mais de uma loja. Escolha o pacote correto.",
        });
        clearCodeField();
        return;
      }

      addPendingCancellation(availableMatches[0]);
    } catch (error) {
      setNotice({
        type: "danger",
        text: `Erro ao localizar pacote: ${formatDatabaseError(error)}`,
      });
    } finally {
      setCheckingPackage(false);
      if (!awaitingChoice) {
        focusCodeField();
      }
    }
  }

  function addPendingCancellation(pacote: DispatchPackage) {
    setPendingCancellations((current) => {
      if (current.some((item) => item.pacote.id === pacote.id)) {
        return current;
      }

      return [{ pacote, justificativa_individual: "" }, ...current];
    });
    setCancellationCandidates([]);
    setNotice({
      type: "success",
      text: `Pacote ${pacote.codigo_rastreio} de ${getCatalogStoreName(pacote.loja_id)} adicionado.`,
    });
    clearCodeField();
    focusCodeField();
  }

  function removePendingCancellation(packageId: string) {
    if (savingCancellation) {
      return;
    }

    setPendingCancellations((current) =>
      current.filter((item) => item.pacote.id !== packageId),
    );
  }

  function requestFinalizePendingCancellations() {
    if (savingCancellation) {
      return;
    }

    if (!cancellationReason.trim()) {
      setNotice({
        type: "warning",
        text: "Informe a justificativa geral antes de finalizar cancelamentos.",
      });
      cancellationReasonRef.current?.focus();
      return;
    }

    if (!pendingCancellations.length) {
      setNotice({
        type: "warning",
        text: "Adicione ao menos um pacote para cancelar.",
      });
      focusCodeField();
      return;
    }

    setShowFinalizeCancellationConfirm(true);
  }

  async function finalizePendingCancellations() {
    if (savingCancellation) {
      return;
    }

    const cleanGeneralReason = cancellationReason.trim();
    if (!cleanGeneralReason) {
      setNotice({
        type: "warning",
        text: "Informe a justificativa geral antes de finalizar cancelamentos.",
      });
      cancellationReasonRef.current?.focus();
      return;
    }

    if (!pendingCancellations.length) {
      setNotice({
        type: "warning",
        text: "Adicione ao menos um pacote para cancelar.",
      });
      focusCodeField();
      return;
    }

    const cancellationSnapshot = [...pendingCancellations];
    let cancellationCompleted = false;
    setShowFinalizeCancellationConfirm(false);
    setSavingCancellation(true);

    try {
      const savedRows = await finalizarCancelamentosEmLote(
        cancellationSnapshot.map((item) => ({
          pacote_id: item.pacote.id,
          justificativa_geral: cleanGeneralReason,
          justificativa_individual: item.justificativa_individual,
        })),
        databaseContext,
      );
      const savedByPackageId = new Map(
        savedRows.map((item) => [item.pacote_id ?? "", item]),
      );
      const records = cancellationSnapshot.map((item) => {
        const saved = savedByPackageId.get(item.pacote.id);

        return {
          ...makeCancellationRecord({
            item: item.pacote,
            generalReason: cleanGeneralReason,
            individualReason: item.justificativa_individual,
            canceledAt: saved?.cancelado_em ?? nowIso(),
          }),
          id: saved?.id ?? makeId("can"),
          pacote_id: saved?.pacote_id ?? item.pacote.id,
        };
      });

      await reload();
      setRecentCancellations((current) => [...records, ...current].slice(0, 8));
      setPendingCancellations([]);
      setCancellationMode(false);
      setCancellationCandidates([]);
      setCancellationReason("");
      cancellationCompleted = true;
      clearCodeField();
      setNotice({
        type: "success",
        text: `${records.length} cancelamento(s) finalizado(s).`,
      });
    } catch (error) {
      setNotice({
        type: "danger",
        text: `Erro ao finalizar cancelamentos: ${formatDatabaseError(error)}`,
      });
    } finally {
      setSavingCancellation(false);
      focusCodeField(!cancellationCompleted);
    }
  }


  function cancelSessionPackage(item: DispatchPackage) {
    if (processingTrackingRef.current || sessionMutationLocked) {
      setNotice({
        type: "warning",
        text: "Aguarde a leitura ou alteração atual terminar.",
      });
      return;
    }
    setPendingSessionCancelPackage(item);
    setSessionCancelReason("");
    setSessionCancelError("");
  }

  async function removeSessionPackage(item: DispatchPackage) {
    if (
      !activeBatchId ||
      processingTrackingRef.current ||
      sessionMutationLocked
    ) {
      return;
    }

    setSessionPackageActionError("");
    setSessionPackageActionStatus("");
    setSavingSession(true);

    try {
      await removerItemSessaoBipagem(
        {
          itemId: item.id,
          status: "descartado",
        },
        databaseContext,
      );
      setSessionPackages((current) =>
        current.filter((sessionItem) => sessionItem.id !== item.id),
      );
      setNotice({
        type: "neutral",
        text: `Pacote ${item.codigo_rastreio} removido do lote.`,
      });
      if (
        showFullscreenSessionPackages &&
        fullscreenPackagesMode === "manual-remove"
      ) {
        setManualPackageRemovalQuery("");
        setSessionPackageActionStatus(
          `Código ${item.codigo_rastreio} removido do lote.`,
        );
      }
    } catch (error) {
      const message = `Erro ao remover pacote do lote: ${formatDatabaseError(error)}`;
      setSessionPackageActionError(message);
      setNotice({ type: "danger", text: message });
    } finally {
      setSavingSession(false);
      if (
        showFullscreenSessionPackages &&
        fullscreenPackagesMode === "manual-remove"
      ) {
        window.requestAnimationFrame(() =>
          manualPackageRemovalInputRef.current?.focus({ preventScroll: true }),
        );
      } else {
        focusCodeField();
      }
    }
  }

  async function confirmSessionPackageCancellation() {
    if (
      !pendingSessionCancelPackage ||
      savingCancellation ||
      savingSession ||
      checkingPackage ||
      processingTrackingRef.current
    ) {
      return;
    }

    const cleanReason = sessionCancelReason.trim();
    if (!cleanReason) {
      setSessionCancelError("Informe a justificativa para cancelar o pacote.");
      return;
    }

    const targetPackage = pendingSessionCancelPackage;
    const canceledAt = nowIso();
    let record = makeCancellationRecord({
      item: targetPackage,
      generalReason: cleanReason,
      individualReason: "",
      canceledAt,
    });
    setSavingCancellation(true);
    setSessionCancelError("");

    try {
      const savedPackage = await getPacoteAtivoPorCodigo(
        targetPackage.codigo_rastreio,
        { loja_id: targetPackage.loja_id },
        databaseContext,
      );
      const savedRows = await cancelarPacotes(
        {
          cancelamentos: [
            {
              pacote_id: savedPackage?.id ?? null,
              codigo_pacote:
                savedPackage?.codigo ?? targetPackage.codigo_rastreio,
              loja_id: savedPackage?.loja_id ?? targetPackage.loja_id,
              marketplace_id:
                savedPackage?.marketplace_id ??
                targetPackage.marketplace_id ??
                getMarketplaceIdByName(targetPackage.marketplace),
              transportadora_id:
                savedPackage?.transportadora_id ??
                getCarrierIdByName(targetPackage.transportadora),
              sessao_id: savedPackage?.sessao_id ?? (activeBatchId || null),
              tipo_operacao:
                savedPackage?.tipo_operacao ?? targetPackage.tipo_operacao,
              melhor_envio:
                savedPackage?.melhor_envio ?? targetPackage.melhor_envio,
              justificativa_geral: cleanReason,
              justificativa_individual: null,
              bipado_em:
                savedPackage?.bipado_em ?? targetPackage.data_hora_bipagem,
              cancelado_em: canceledAt,
            },
          ],
          movimentacoes: [
            {
              pacote_id: savedPackage?.id ?? null,
              loja_id: savedPackage?.loja_id ?? targetPackage.loja_id,
              sessao_id: savedPackage?.sessao_id ?? (activeBatchId || null),
              tipo_movimentacao: "Cancelamento",
              descricao: `Pacote ${savedPackage?.codigo ?? targetPackage.codigo_rastreio} cancelado durante a preparação do lote.`,
              criada_em: canceledAt,
            },
          ],
        },
        databaseContext,
      );

      record = {
        ...record,
        id: savedRows[0]?.id ?? record.id,
        pacote_id: savedRows[0]?.pacote_id ?? targetPackage.id,
      };
      await removerItemSessaoBipagem(
        {
          itemId: targetPackage.id,
          status: "cancelado",
        },
        databaseContext,
      );
      setSessionPackages((current) =>
        current.filter((item) => item.id !== targetPackage.id),
      );
      await reload();
      setRecentCancellations((current) => [record, ...current].slice(0, 8));
    } catch (error) {
      setSessionCancelError(
        `Erro ao cancelar pacote: ${formatDatabaseError(error)}`,
      );
      setSavingCancellation(false);
      return;
    }
    setSavingCancellation(false);
    setNotice({
      type: "success",
      text: `Pacote ${targetPackage.codigo_rastreio} cancelado e enviado ao histórico.`,
    });
    setPendingSessionCancelPackage(null);
    setSessionCancelReason("");
    setSessionCancelError("");
    focusCodeField();
  }

  const sessionHeader = (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-950">
        <span>{getCatalogStoreName(selectedLojaId)}</span>
        <span className="text-slate-400">•</span>
        <span>{selectedMarketplace || "-"}</span>
        <span className="text-slate-400">•</span>
        <span>
          {tipoOperacao ? getOperationLabel(tipoOperacao) : "Operação pendente"}
        </span>
      </div>
      {melhorEnvio ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="green">Melhor Envio</Badge>
          <Badge tone="purple">
            Transportadora: {transportadora || "Não informada"}
          </Badge>
        </div>
      ) : (
        <div className="mt-3">
          <Badge tone="neutral">Sem Melhor Envio</Badge>
        </div>
      )}
    </div>
  );

  return (
    <section
      ref={mobileImmersiveRef}
      tabIndex={mobileImmersiveSession ? -1 : undefined}
      aria-label={
        mobileImmersiveSession ? "Tela exclusiva de bipagem" : undefined
      }
      className={`grid min-w-0 items-start gap-5 pb-[calc(7rem+env(safe-area-inset-bottom))] transition xl:grid-cols-[minmax(380px,0.9fr)_minmax(460px,1.1fr)] xl:pb-0 2xl:gap-7 ${
        mobileImmersiveSession
          ? "mobile-immersive-session max-xl:fixed max-xl:inset-0 max-xl:z-[80] max-xl:flex max-xl:h-dvh max-xl:flex-col max-xl:items-stretch max-xl:gap-0 max-xl:overflow-hidden max-xl:bg-slate-100 max-xl:pb-0"
          : ""
      }`}
    >
      {loading || loadingOpenSession ? (
        <div className={`xl:col-span-2 ${mobileImmersiveSession ? "max-xl:hidden" : ""}`}>
          <FeedbackMessage tone="neutral">
            Carregando seus dados e o lote em andamento...
          </FeedbackMessage>
        </div>
      ) : null}

      {error ? (
        <div className={`xl:col-span-2 ${mobileImmersiveSession ? "max-xl:hidden" : ""}`}>
          <FeedbackMessage tone="danger">{error}</FeedbackMessage>
        </div>
      ) : null}

      <form
        ref={cancellationPanelRef}
        onSubmit={handleSubmit}
        noValidate
        className={`grid min-w-0 gap-4 self-start ${
          cancellationMode
            ? "mx-auto w-full max-w-6xl scroll-mt-24 xl:col-span-2 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)] xl:items-start"
            : ""
        } ${mobileImmersiveSession ? "max-xl:contents" : ""}`}
      >
        {cancellationMode ? (
          <div className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-rose-600">
                  Cancelamento em lote
                </p>
                <h2 className="mt-1.5 text-lg font-bold text-slate-950">
                  Cancelar pacotes finalizados
                </h2>
                <p className="mt-1.5 max-w-xl text-sm leading-5 text-slate-600">
                  Bipe quantos pacotes precisar, sem escolher a loja. Se um
                  rastreio existir em mais de uma loja, você escolhe o correto.
                  Nada será cancelado até a confirmação final.
                </p>
              </div>
              <Badge tone="red">{pendingCancellations.length} selecionados</Badge>
            </div>

            <ol className="mt-4 flex flex-wrap gap-2">
              {[
                ["1", "Bipe os rastreios"],
                ["2", "Revise os pacotes"],
                ["3", "Informe o motivo e finalize"],
              ].map(([step, label]) => (
                <li
                  key={step}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-950 text-[0.65rem] font-bold text-white">
                    {step}
                  </span>
                  <span className="text-xs font-semibold text-slate-700">
                    {label}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
        <div
          className={`rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.38)] sm:p-6 ${
            mobileImmersiveSession ? "max-xl:hidden" : ""
          }`}
        >
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Configuração do lote
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Configure uma vez. Depois do primeiro pacote, os dados ficam
                bloqueados até finalizar ou cancelar o lote.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={sessionOpen ? "green" : "neutral"}>
                {sessionOpen ? "Lote em andamento" : "Pronto para iniciar"}
              </Badge>
              {cancellationMode ? (
                <Badge tone="red">Cancelamento</Badge>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Loja"
              value={selectedLojaId}
              onChange={setLojaId}
              disabled={configLocked}
              required
              placeholder="Selecione uma loja"
              options={activeStores.map((store) => ({
                value: store.id,
                label: store.name,
              }))}
            />

            <SelectField
              label="Marketplace"
              value={selectedMarketplaceId}
              onChange={setMarketplaceId}
              disabled={configLocked}
              required
              placeholder="Selecione um marketplace"
              options={activeMarketplaces.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
          </div>

          <fieldset className="mt-5" disabled={configLocked}>
            <legend className="mb-3 text-sm font-semibold text-slate-800">
              Tipo de operação
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["coleta", "postagem"] as OperationType[]).map((operation) => (
                <button
                  key={operation}
                  type="button"
                  disabled={configLocked}
                  onClick={() => {
                    setTipoOperacao(operation);
                    focusCodeField();
                  }}
                  className={`min-h-14 rounded-lg border px-4 text-base font-semibold transition disabled:cursor-not-allowed ${
                    tipoOperacao === operation
                      ? "border-teal-500 bg-teal-50 text-teal-900"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
                  }`}
                >
                  {getOperationLabel(operation)}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)] md:items-end">
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">
                Usa Melhor Envio?
              </p>
              <button
                type="button"
                aria-pressed={melhorEnvio}
                disabled={configLocked}
                onClick={() => handleMelhorEnvioChange(!melhorEnvio)}
                className={`flex min-h-12 w-full items-center justify-between rounded-lg border px-4 text-sm font-semibold transition disabled:cursor-not-allowed ${
                  melhorEnvio
                    ? "border-teal-500 bg-teal-50 text-teal-900"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 disabled:text-slate-400"
                }`}
              >
                <span>{melhorEnvio ? "Sim" : "Não"}</span>
                <span
                  className={`h-6 w-11 rounded-full p-1 transition ${
                    melhorEnvio ? "bg-teal-700" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`block size-4 rounded-full bg-white transition ${
                      melhorEnvio ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </span>
              </button>
            </div>

            {melhorEnvio ? (
              <SelectField
                label="Transportadora"
                value={transportadora}
                onChange={setTransportadora}
                disabled={configLocked}
                required
                placeholder="Selecione a transportadora"
                options={activeCarriers.map((carrier) => ({
                  value: carrier.name,
                  label: carrier.name,
                }))}
              />
            ) : (
              <div className="grid gap-2 text-sm font-medium text-slate-700">
                Transportadora
                <div className="flex min-h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
                  Não se aplica
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Badge tone="neutral">Loja: {getCatalogStoreName(selectedLojaId)}</Badge>
            <Badge tone="blue">Marketplace: {selectedMarketplace || "-"}</Badge>
            {tipoOperacao ? (
              <OperationBadge operation={tipoOperacao} />
            ) : (
              <Badge tone="amber">Operação pendente</Badge>
            )}
            <MelhorEnvioBadge active={melhorEnvio} />
            <Badge tone={transportadora ? "purple" : "neutral"}>
              Transportadora: {transportadora || "-"}
            </Badge>
            <Badge tone={sessionOpen ? "green" : "neutral"}>
              Lote: {activeBatchId || "novo"}
            </Badge>
          </div>

          {sessionOpen ? (
            <div className="mt-5 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-900">
              Lote em andamento. Para alterar loja, marketplace, operação ou
              Melhor Envio, finalize ou descarte o lote atual.
            </div>
          ) : null}
        </div>
        )}

        <div
          className={`mobile-session-scan-panel rounded-2xl border bg-white p-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.4)] sm:p-5 ${
            cancellationMode
              ? "border-rose-300"
              : "border-slate-200"
          } ${
            mobileImmersiveSession
              ? "max-xl:shrink-0 max-xl:rounded-none max-xl:border-x-0 max-xl:border-t-0 max-xl:p-2 max-xl:pt-[calc(0.5rem+env(safe-area-inset-top))] max-xl:shadow-none"
              : ""
          } ${
            !cancellationMode && !mobileImmersiveSession
              ? "max-xl:hidden"
              : ""
          }`}
        >
          {!cancellationMode && mobileImmersiveSession ? (
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 xl:hidden">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-500">
                    {sessionOpen ? "Lote em andamento" : "Bipagem pronta"}
                  </p>
                  <p className="mt-1 truncate text-sm font-bold text-slate-950">
                    {getCatalogStoreName(selectedLojaId)} · {selectedMarketplace}
                  </p>
                </div>
                <Badge tone="green">{sessionPackages.length} pacotes</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {tipoOperacao ? (
                  <OperationBadge operation={tipoOperacao} />
                ) : null}
                <MelhorEnvioBadge active={melhorEnvio} />
                {melhorEnvio ? (
                  <Badge tone={transportadora ? "purple" : "amber"}>
                    {transportadora || "Transportadora pendente"}
                  </Badge>
                ) : null}
              </div>
            </div>
          ) : null}

          {!cancellationMode ? (
            <div
              className={`gap-2 ${
                showMobileManualInput ? "mb-2 grid" : "hidden"
              } xl:mb-4 xl:grid`}
            >
              <label
                htmlFor="tracking-code-input"
                className="sr-only text-sm font-medium text-slate-700 xl:not-sr-only"
              >
                Código do pacote
              </label>
              <div className="flex min-w-0 items-center gap-2">
                <input
                  ref={codeRef}
                  id="tracking-code-input"
                  className="min-h-11 min-w-0 flex-1 rounded-xl border-2 border-slate-300 bg-white px-3 font-mono text-sm font-bold uppercase text-slate-950 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100 xl:min-h-20 xl:px-5 xl:text-2xl xl:tracking-wide xl:placeholder:text-base xl:placeholder:tracking-normal"
                  placeholder="Bipe ou digite o código do pacote"
                  autoComplete="off"
                  required
                />
                <button
                  type="submit"
                  disabled={submitDisabled || Boolean(cameraDisabledMessage)}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 px-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 xl:hidden"
                >
                  Adicionar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearCodeField();
                    setShowMobileManualInput(false);
                  }}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-600 xl:hidden"
                  aria-label="Fechar entrada manual"
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : null}

          {!cancellationMode && mobileImmersiveSession ? (
            <MobileCameraScanner
              key={cameraDisabledMessage ? "camera-disabled" : "camera-ready"}
              busy={submitDisabled}
              disabled={Boolean(cameraDisabledMessage)}
              disabledMessage={cameraDisabledMessage}
              pause={cameraPaused}
              onDetected={processTrackingCode}
            />
          ) : null}

          {cancellationMode ? (
            <div className="mb-4 grid gap-3">
              <label className="grid gap-2 text-sm font-medium text-rose-900">
                Justificativa geral (obrigatória ao finalizar)
                <textarea
                  ref={cancellationReasonRef}
                  value={cancellationReason}
                  onChange={(event) => setCancellationReason(event.target.value)}
                  disabled={savingCancellation}
                  className="min-h-20 rounded-md border border-rose-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-rose-600 focus:ring-4 focus:ring-rose-100"
                  placeholder="Você pode bipar primeiro e preencher o motivo antes de finalizar"
                />
              </label>

            </div>
          ) : null}

          {cancellationMode ? (
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Rastreio finalizado
              <input
                ref={codeRef}
                className="min-h-16 rounded-xl border-2 border-rose-300 bg-white px-5 font-mono text-2xl font-bold tracking-wide text-slate-950 outline-none transition placeholder:text-base placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-400 focus:border-rose-600 focus:ring-4 focus:ring-rose-100"
                placeholder="Bipe o pacote que deseja cancelar"
                autoComplete="off"
                required
              />
            </label>
          ) : null}

          <div
            className={`mt-4 grid gap-3 ${
              cancellationMode
                ? "sm:grid-cols-3"
                : "sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"
            } ${mobileImmersiveSession ? "max-xl:hidden" : ""}`}
          >
            <button
              type="submit"
              disabled={submitDisabled}
              className={`${
                cancellationMode ? "inline-flex" : "hidden xl:inline-flex"
              } min-h-12 items-center justify-center rounded-xl px-5 text-sm font-bold text-white transition focus:outline-none focus:ring-4 ${
                cancellationMode
                  ? "bg-rose-700 hover:bg-rose-800 focus:ring-rose-100"
                  : "bg-slate-950 hover:bg-slate-800 focus:ring-slate-200"
              } ${submitDisabled ? "cursor-not-allowed opacity-70" : ""}`}
            >
              {cancellationMode ? "Adicionar pacote" : "Bipar pacote"}
            </button>
            {cancellationMode ? (
              <>
                <button
                  type="button"
                  onClick={requestFinalizePendingCancellations}
                  disabled={savingCancellation || !pendingCancellations.length}
                  className="inline-flex min-h-12 items-center justify-center rounded-md bg-rose-700 px-5 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {pendingCancellations.length
                    ? `Cancelar ${pendingCancellations.length} ${pendingCancellations.length === 1 ? "pacote" : "pacotes"}`
                    : "Cancelar pacotes"}
                </button>
                <button
                  type="button"
                  onClick={requestExitCancellationMode}
                  disabled={savingCancellation}
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-rose-300 bg-white px-5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus:ring-4 focus:ring-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  Voltar para bipar
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={finishSession}
                  disabled={finalizeDisabled}
                  className={`hidden min-h-12 items-center justify-center rounded-md px-5 text-sm font-semibold text-white transition focus:outline-none focus:ring-4 xl:inline-flex ${
                    finalizeDisabled
                      ? "cursor-not-allowed bg-slate-300 focus:ring-slate-100"
                      : "bg-teal-700 hover:bg-teal-800 focus:ring-teal-100"
                  }`}
                >
                  Finalizar lote
                </button>
                <button
                  type="button"
                  onClick={clearSession}
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-100"
                >
                  Descartar lote
                </button>
                <button
                  type="button"
                  onClick={requestCancellationMode}
                  disabled={
                    loading || loadingOpenSession || savingSession || checkingPackage
                  }
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-rose-300 bg-rose-50 px-5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-4 focus:ring-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  Cancelar finalizados
                </button>
              </>
            )}
          </div>

          {notice &&
          (!mobileImmersiveSession ||
            notice.type === "warning" ||
            notice.type === "danger") ? (
            <div className={`mt-4 ${mobileImmersiveSession ? "mobile-scan-notice max-xl:mt-2" : ""}`}>
              <FeedbackMessage tone={notice.type}>{notice.text}</FeedbackMessage>
            </div>
          ) : null}

          {cancellationMode ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-rose-950">
                  Pacotes para cancelar
                </h3>
                <Badge tone="red">{pendingCancellations.length} na lista</Badge>
              </div>

              {pendingCancellations.length ? (
                <div className="app-scroll-region mt-3 max-h-[min(40dvh,26rem)] space-y-3 overflow-y-auto pr-1">
                  {pendingCancellations.map((item) => (
                    <div
                      key={item.pacote.id}
                      className="grid gap-3 rounded-md border border-rose-100 bg-white p-3 text-sm text-slate-700"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-all font-mono font-semibold text-slate-950">
                            {item.pacote.codigo_rastreio}
                          </p>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                            {getCatalogStoreName(item.pacote.loja_id)} ·{" "}
                            {item.pacote.marketplace} ·{" "}
                            {getOperationLabel(item.pacote.tipo_operacao)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Melhor Envio: {item.pacote.melhor_envio ? "Sim" : "Nao"} ·{" "}
                            {item.pacote.transportadora || "Sem transportadora"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removePendingCancellation(item.pacote.id)}
                          disabled={savingCancellation}
                          className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          Remover
                        </button>
                      </div>
                      <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
                        Justificativa somente deste pacote (opcional)
                        <textarea
                          value={item.justificativa_individual}
                          onChange={(event) => {
                            const value = event.target.value;
                            setPendingCancellations((current) =>
                              current.map((pendingItem) =>
                                pendingItem.pacote.id === item.pacote.id
                                  ? {
                                      ...pendingItem,
                                      justificativa_individual: value,
                                    }
                                  : pendingItem,
                              ),
                            );
                          }}
                          disabled={savingCancellation}
                          className="min-h-16 resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-950 outline-none transition focus:border-rose-500 focus:bg-white focus:ring-4 focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                          placeholder="Se preenchida, esta justificativa prevalece sobre a geral"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-rose-200 bg-white px-4 py-3 text-center text-sm leading-5 text-slate-600">
                  Nenhum pacote na lista. Bipe um pacote para preparar o
                  cancelamento.
                </div>
              )}
            </div>
          ) : null}

          {!cancellationMode && recentCancellations.length ? (
            <div className={`mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 ${mobileImmersiveSession ? "max-xl:hidden" : ""}`}>
              <h3 className="text-sm font-semibold text-slate-950">
                Últimos cancelamentos
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {recentCancellations.map((item) => (
                  <Badge key={item.id} tone="red">
                    {item.codigo_pacote}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </form>

      {!cancellationMode ? (
      <div
        className={`mobile-session-list grid min-w-0 w-full gap-5 self-start ${
          mobileImmersiveSession
            ? "max-xl:flex max-xl:min-h-0 max-xl:flex-1 max-xl:flex-col max-xl:self-stretch max-xl:overflow-hidden max-xl:px-2 max-xl:pb-[calc(4.75rem+env(safe-area-inset-bottom))]"
            : ""
        }`}
      >
        <div
          ref={sessionListRef}
          className={`flex min-w-0 w-full scroll-mt-20 flex-col rounded-2xl border border-slate-200/90 bg-white p-3 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.38)] sm:p-6 ${
            mobileImmersiveSession
              ? "max-xl:min-h-0 max-xl:flex-1 max-xl:rounded-xl max-xl:p-2 max-xl:shadow-none"
              : ""
          }`}
        >
          <div className={`mb-3 flex shrink-0 flex-col items-start gap-3 sm:mb-4 sm:flex-row sm:justify-between sm:gap-4 ${mobileImmersiveSession ? "max-xl:mb-2 max-xl:flex-row max-xl:items-center max-xl:justify-between max-xl:gap-2" : ""}`}>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-950">
                {mobileImmersiveSession ? "Pacotes bipados" : "Pacotes deste lote"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {sessionPackages.length} pacotes no lote atual.
              </p>
            </div>
            <div className={`shrink-0 ${mobileImmersiveSession ? "max-xl:hidden" : ""}`}>
              <StatusBadge status="Pendente no lote" />
            </div>
          </div>

          <div
            className={`mb-3 min-w-0 shrink-0 rounded-lg border px-3 py-2.5 sm:mb-4 sm:px-4 sm:py-3 ${mobileImmersiveSession ? "max-xl:hidden" : ""} ${
              latestSessionPackage
                ? "border-emerald-200 bg-emerald-50"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <p
              className={`text-xs font-semibold uppercase tracking-[0.14em] ${
                latestSessionPackage ? "text-emerald-700" : "text-slate-500"
              }`}
            >
              {"\u00daltimo pacote bipado"}
            </p>
            <p
              className="mt-1 break-all font-mono text-base font-semibold text-slate-950 sm:text-lg"
              title={latestSessionPackage?.codigo_rastreio}
            >
              {latestSessionPackage?.codigo_rastreio ?? "Aguardando pacote"}
            </p>
          </div>

          {sessionPackages.length ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 sm:gap-4">
              <div className={mobileImmersiveSession ? "max-xl:hidden" : ""}>
                {sessionHeader}
              </div>
              {hasSessionDuplicates ? (
                <div className={mobileImmersiveSession ? "max-xl:hidden" : ""}>
                  <FeedbackMessage tone="danger">
                    {DUPLICATE_SESSION_WARNING} Códigos:{" "}
                    {duplicateSessionCodeList.join(", ")}.
                  </FeedbackMessage>
                </div>
              ) : null}
              <div className={`flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${mobileImmersiveSession ? "max-xl:hidden" : ""}`}>
                <p className="text-xs font-medium text-slate-500">
                  Exibindo {filteredSessionPackages.length} de{" "}
                  {sessionPackages.length} pacotes.
                </p>
                <div
                  className="grid w-full grid-cols-2 gap-2 sm:w-auto"
                  role="group"
                  aria-label="Filtrar pacotes deste lote"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowOnlySessionDuplicates(false);
                      setVisibleSessionPackageCount(SESSION_PACKAGE_PAGE_SIZE);
                    }}
                    aria-pressed={!showOnlySessionDuplicates}
                    className={`inline-flex min-h-10 items-center justify-center rounded-md border px-3 text-xs font-semibold transition ${
                      !showOnlySessionDuplicates
                        ? "border-slate-700 bg-slate-950 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    Todos ({sessionPackages.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowOnlySessionDuplicates(true);
                      setVisibleSessionPackageCount(SESSION_PACKAGE_PAGE_SIZE);
                    }}
                    disabled={!hasSessionDuplicates && !showOnlySessionDuplicates}
                    aria-pressed={showOnlySessionDuplicates}
                    className={`inline-flex min-h-10 items-center justify-center rounded-md border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 ${
                      showOnlySessionDuplicates
                        ? "border-rose-600 bg-rose-600 text-white"
                        : "border-rose-300 bg-white text-rose-700 hover:bg-rose-50"
                    }`}
                  >
                    Duplicados ({duplicateSessionPackages.length})
                  </button>
                </div>
              </div>
              <div className={`app-scroll-region h-[54dvh] min-h-56 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-1 [scrollbar-gutter:stable] sm:h-auto sm:max-h-[50dvh] sm:pr-2 xl:max-h-[min(55dvh,32rem)] ${mobileImmersiveSession ? "max-xl:h-auto max-xl:min-h-0 max-xl:max-h-none max-xl:overscroll-contain max-xl:pr-0" : ""}`}>
                {visibleSessionPackages.length ? (
                  <ol className="space-y-2">
                  {visibleSessionPackages.map((item) => {
                    const isDuplicate = duplicateSessionCodes.has(
                      normalizeTrackingCode(item.codigo_rastreio),
                    );
                    const isLatestSessionPackage =
                      latestSessionPackage?.id === item.id;
                    const packageNumber = sessionPackageNumbers.get(item.id);

                    return (
                      <li
                        key={item.id}
                        className={`flex flex-col items-stretch gap-3 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${
                          isDuplicate
                            ? "border-rose-300 bg-rose-50"
                            : isLatestSessionPackage
                              ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200"
                              : "border-slate-200"
                        }`}
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <span className="shrink-0 text-sm font-semibold text-slate-400">
                            {packageNumber}.
                          </span>
                          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <span
                              className="min-w-0 break-all font-mono text-sm font-semibold text-slate-950"
                              title={item.codigo_rastreio}
                            >
                              {item.codigo_rastreio}
                            </span>
                            {isDuplicate ? (
                              <span className="inline-flex min-h-7 shrink-0 items-center rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700">
                                Duplicado
                              </span>
                            ) : null}
                            {isLatestSessionPackage ? (
                              <span className="inline-flex min-h-7 shrink-0 items-center rounded-md border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                                Último bipado
                              </span>
                            ) : null}
                          </span>
                        </div>
                        <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap sm:justify-end">
                          <button
                            type="button"
                            onClick={() => removeSessionPackage(item)}
                            disabled={sessionMutationLocked}
                            aria-label={`${isDuplicate ? "Remover repetição" : "Remover pacote"} ${item.codigo_rastreio}`}
                            className={`inline-flex min-h-11 items-center justify-center rounded-md border bg-white px-3 text-xs font-semibold transition disabled:cursor-wait disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 ${
                              isDuplicate
                                ? "border-rose-300 text-rose-700 hover:bg-rose-100"
                                : "border-slate-300 text-slate-700 hover:border-slate-400 hover:text-slate-950"
                            }`}
                          >
                            {isDuplicate ? "Remover repetição" : "Remover"}
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelSessionPackage(item)}
                            disabled={sessionMutationLocked}
                            className="inline-flex min-h-11 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-wait disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            Cancelar
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                ) : (
                  <EmptyState>
                    Nenhum pacote duplicado neste lote.
                  </EmptyState>
                )}
                {visibleSessionPackages.length <
                filteredSessionPackages.length ? (
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleSessionPackageCount((current) =>
                        Math.min(
                          current + SESSION_PACKAGE_PAGE_SIZE,
                          filteredSessionPackages.length,
                        ),
                      )
                    }
                    className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                  >
                    Mostrar mais pacotes ({visibleSessionPackages.length} de{" "}
                    {filteredSessionPackages.length})
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <EmptyState>Nenhum rastreio bipado neste lote.</EmptyState>
          )}
        </div>

        <div className={`flex min-h-[320px] flex-col rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.38)] sm:p-6 ${mobileImmersiveSession ? "max-xl:hidden" : ""}`}>
          <div className="mb-4 shrink-0">
            <h2 className="text-lg font-semibold text-slate-950">
              Histórico de lotes
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Abra um lote para ver somente os pacotes vinculados a ele.
            </p>
          </div>

          <div className="app-scroll-region max-h-[min(52dvh,34rem)] min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
            {sortedBatches.length ? (
              <div className="space-y-3">
                {visibleBatches.map((batch) => (
                  <div
                    key={batch.id}
                    className="rounded-lg border border-slate-200 p-3 text-sm transition hover:border-slate-300"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-base font-semibold text-slate-950">
                          {getBatchCode(batch)}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-700">
                          {getCatalogStoreName(batch.loja_id)} · {batch.marketplace} ·{" "}
                          {getOperationLabel(batch.tipo_operacao)}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {batch.finalizado_em
                            ? formatPackageDate(batch.finalizado_em)
                            : "em aberto"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {batch.total_pacotes} {batch.total_pacotes === 1 ? "pacote" : "pacotes"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openBatchHistory(batch.id)}
                          className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                        >
                          Abrir lote
                        </button>
                        <button
                          type="button"
                          onClick={() => openStoreRomaneio(batch)}
                          className="inline-flex min-h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800"
                        >
                          Romaneio da loja
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {visibleBatches.length < sortedBatches.length ? (
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleBatchCount((current) =>
                        Math.min(
                          current + BATCH_HISTORY_PAGE_SIZE,
                          sortedBatches.length,
                        ),
                      )
                    }
                    className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                  >
                    Mostrar mais lotes ({visibleBatches.length} de{" "}
                    {sortedBatches.length})
                  </button>
                ) : null}
              </div>
            ) : (
              <EmptyState>Nenhum lote finalizado.</EmptyState>
            )}
          </div>
        </div>
      </div>
      ) : null}

      {!cancellationMode ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pt-2 shadow-[0_-14px_36px_-24px_rgba(15,23,42,0.55)] backdrop-blur xl:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {mobileImmersiveSession ? (
              <>
                <button
                  ref={mobileSessionOptionsTriggerRef}
                  type="button"
                  onClick={() => setShowMobileSessionOptions(true)}
                  disabled={sessionMutationLocked}
                  aria-haspopup="dialog"
                  aria-expanded={showMobileSessionOptions}
                  aria-controls="mobile-session-options"
                  className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 disabled:cursor-wait disabled:bg-slate-100 disabled:text-slate-400"
                >
                  Opções
                </button>
                <button
                  type="button"
                  onClick={hasSessionDuplicates ? showDuplicatePackages : finishSession}
                  disabled={
                    !hasSessionDuplicates &&
                    (finalizeDisabled || !sessionPackages.length || !activeBatchId)
                  }
                  className={`inline-flex min-h-12 min-w-[10rem] flex-1 items-center justify-center rounded-xl px-4 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:bg-slate-300 ${
                    hasSessionDuplicates
                      ? "bg-rose-700 hover:bg-rose-800"
                      : "bg-teal-700 hover:bg-teal-800"
                  }`}
                >
                  {hasSessionDuplicates
                    ? `Corrigir ${duplicateExcessCount} ${duplicateExcessCount === 1 ? "duplicado" : "duplicados"}`
                    : "Finalizar bipagem"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startMobileScanning}
                disabled={Boolean(cameraDisabledMessage) || submitDisabled}
                className="inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-teal-700 px-5 text-base font-bold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                Iniciar bipagem
              </button>
            )}
          </div>
        </div>
      ) : null}

      {showMobileSessionOptions && mobileImmersiveSession ? (
        <section
          id="mobile-session-options"
          ref={mobileSessionOptionsRef}
          tabIndex={-1}
          className="fixed inset-0 z-[90] flex items-end bg-slate-950/55 px-3 pt-6 xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-session-options-title"
        >
          <div className="mx-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl [scrollbar-gutter:stable]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-slate-400">
                  Lote em andamento
                </p>
                <h2 id="mobile-session-options-title" className="mt-1 text-lg font-bold text-slate-950">
                  Opções da bipagem
                </h2>
              </div>
              <button
                type="button"
                onClick={closeMobileSessionOptions}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={openFullscreenSessionPackages}
                disabled={!sessionPackages.length || sessionMutationLocked}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Ver pacotes em tela cheia ({sessionPackages.length})
              </button>
              <button
                ref={mobileSessionOptionsInitialFocusRef}
                type="button"
                onClick={openMobileManualEntry}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700"
              >
                Adicionar código manualmente
              </button>
              <button
                type="button"
                onClick={openManualPackageRemoval}
                disabled={!sessionPackages.length || sessionMutationLocked}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-bold text-amber-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                Remover código manualmente
              </button>
              <button
                type="button"
                onClick={showDuplicatePackages}
                disabled={!hasSessionDuplicates}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-rose-300 bg-rose-50 px-4 text-sm font-bold text-rose-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                {hasSessionDuplicates
                  ? `Corrigir ${duplicateExcessCount} duplicado${duplicateExcessCount === 1 ? "" : "s"}`
                  : "Nenhum duplicado"}
              </button>
              <button
                type="button"
                onClick={openMobileBatchHistory}
                disabled={sessionMutationLocked}
                aria-haspopup="dialog"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-bold text-sky-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                Histórico e romaneios
              </button>
              <button
                type="button"
                onClick={discardSessionFromMobileOptions}
                disabled={sessionMutationLocked}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-rose-300 bg-white px-4 text-sm font-bold text-rose-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                {activeBatchId ? "Descartar lote" : "Sair da bipagem"}
              </button>
            </div>

            <p className="mt-3 text-center text-xs font-medium leading-5 text-slate-500">
              A câmera fica pausada enquanto este menu está aberto.
            </p>
          </div>
        </section>
      ) : null}

      {showFullscreenSessionPackages && mobileImmersiveSession ? (
        <section
          ref={fullscreenPackagesRef}
          tabIndex={-1}
          className={`fixed inset-0 z-[100] flex h-dvh flex-col overflow-hidden bg-slate-100 text-slate-950 xl:hidden ${
            fullscreenPackagesMode === "manual-remove"
              ? "mobile-manual-removal-dialog"
              : ""
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="fullscreen-packages-title"
        >
          <header className="shrink-0 border-b border-slate-200 bg-white px-3 pb-3 pt-[calc(0.5rem+env(safe-area-inset-top))] shadow-sm">
            <div className="mx-auto flex w-full max-w-xl items-center gap-3">
              <button
                ref={fullscreenPackagesInitialFocusRef}
                type="button"
                onClick={closeFullscreenSessionPackages}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"
              >
                <span aria-hidden="true">←</span>
                <span className="ml-1">Voltar</span>
              </button>
              <div className="min-w-0 flex-1">
                <h2
                  id="fullscreen-packages-title"
                  className="truncate text-base font-bold"
                >
                  {fullscreenPackagesMode === "manual-remove"
                    ? "Remover código bipado"
                    : "Pacotes bipados"}
                </h2>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  {sessionPackages.length}{" "}
                  {sessionPackages.length === 1 ? "pacote no lote" : "pacotes no lote"}
                </p>
              </div>
              {hasSessionDuplicates ? (
                <span
                  className="shrink-0 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800"
                  aria-label={`${duplicateExcessCount} repetições pendentes`}
                >
                  {duplicateExcessCount} duplicado{duplicateExcessCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          </header>

          {fullscreenPackagesMode === "manual-remove" ? (
            <div className="mobile-manual-removal-search shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-3">
              <div className="mx-auto grid w-full max-w-xl gap-2">
                <label
                  htmlFor="manual-package-removal-query"
                  className="text-xs font-bold text-amber-950"
                >
                  Código bipado
                </label>
                <input
                  ref={manualPackageRemovalInputRef}
                  id="manual-package-removal-query"
                  value={manualPackageRemovalQuery}
                  onChange={(event) => {
                    setManualPackageRemovalQuery(event.target.value);
                    setSessionPackageActionError("");
                    setSessionPackageActionStatus("");
                  }}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="Digite ou bipe para localizar"
                  className="min-h-12 w-full rounded-xl border-2 border-amber-300 bg-white px-3 font-mono text-base font-bold uppercase text-slate-950 outline-none transition placeholder:font-sans placeholder:text-sm placeholder:font-medium placeholder:normal-case focus:border-amber-600 focus:ring-4 focus:ring-amber-100"
                />
                <div className="flex items-start justify-between gap-3 text-xs font-medium leading-5 text-amber-950">
                  <p className="max-w-md">
                    Escolha uma leitura e toque em Remover do lote. Isso não
                    cancela o pacote.
                  </p>
                  <span
                    className="shrink-0 rounded-full bg-white px-2.5 py-1 font-bold"
                    role="status"
                    aria-live="polite"
                  >
                    {manualPackageRemovalHasQuery
                      ? `${fullscreenSessionPackages.length} encontrado${fullscreenSessionPackages.length === 1 ? "" : "s"}`
                      : "Digite um código"}
                  </span>
                </div>
                {sessionPackageActionStatus ? (
                  <p
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800"
                    role="status"
                    aria-live="polite"
                  >
                    {sessionPackageActionStatus}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mobile-manual-removal-results mx-auto min-h-0 w-full max-w-xl flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] [scrollbar-gutter:stable]">
            {sessionPackageActionError ? (
              <p
                className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold leading-5 text-rose-800"
                role="alert"
              >
                {sessionPackageActionError}
              </p>
            ) : null}
            {fullscreenSessionPackages.length ? (
              <ol className="space-y-3">
                {fullscreenSessionPackages.map((item) => {
                  const isDuplicate = duplicateSessionCodes.has(
                    normalizeTrackingCode(item.codigo_rastreio),
                  );
                  const isLatestSessionPackage =
                    latestSessionPackage?.id === item.id;
                  const packageNumber = sessionPackageNumbers.get(item.id);

                  return (
                    <li
                      key={`fullscreen-${item.id}`}
                      className={`rounded-2xl border bg-white p-4 shadow-sm ${
                        isDuplicate
                          ? "border-rose-300 bg-rose-50"
                          : isLatestSessionPackage
                            ? "border-emerald-400 bg-emerald-50"
                            : "border-slate-200"
                      } ${isLatestSessionPackage ? "ring-2 ring-emerald-200" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-slate-400">
                            Pacote {packageNumber}
                          </p>
                          <p
                            className="mt-2 break-all font-mono text-base font-bold leading-6 text-slate-950"
                            title={item.codigo_rastreio}
                          >
                            {item.codigo_rastreio}
                          </p>
                          <p className="mt-1 text-xs font-medium text-slate-500">
                            {formatPackageDate(item.data_hora_bipagem)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          {isLatestSessionPackage ? (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[0.65rem] font-bold text-emerald-800">
                              ÚLTIMO BIPADO
                            </span>
                          ) : null}
                          {isDuplicate ? (
                            <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[0.65rem] font-bold text-rose-800">
                              DUPLICADO
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div
                        className={`mt-4 grid gap-2 ${
                          fullscreenPackagesMode === "manual-remove"
                            ? "grid-cols-1"
                            : "grid-cols-2"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => removeSessionPackage(item)}
                          disabled={sessionMutationLocked}
                          className={`inline-flex min-h-12 items-center justify-center rounded-xl border bg-white px-3 text-sm font-bold transition disabled:cursor-wait disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 ${
                            isDuplicate
                              ? "border-rose-300 text-rose-700"
                              : "border-slate-300 text-slate-700"
                          }`}
                          aria-label={`${
                            fullscreenPackagesMode === "manual-remove"
                              ? "Remover do lote"
                              : isDuplicate
                                ? "Remover repetição"
                                : "Remover pacote"
                          } ${item.codigo_rastreio}`}
                        >
                          {fullscreenPackagesMode === "manual-remove"
                            ? "Remover do lote"
                            : isDuplicate
                              ? "Remover repetição"
                              : "Remover"}
                        </button>
                        {fullscreenPackagesMode === "browse" ? (
                          <button
                            type="button"
                            onClick={() => cancelSessionPackageFromFullscreen(item)}
                            disabled={sessionMutationLocked}
                            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-bold text-rose-700 transition disabled:cursor-wait disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            Cancelar
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : fullscreenPackagesMode === "manual-remove" &&
              !manualPackageRemovalHasQuery &&
              sessionPackages.length ? (
              <div className="grid min-h-full place-items-center px-5 py-10 text-center">
                <div>
                  <span
                    className="mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-2xl font-bold text-amber-800"
                    aria-hidden="true"
                  >
                    ⌕
                  </span>
                  <h3 className="mt-4 text-xl font-bold">Localize a leitura</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                    Digite ou bipe o código acima. A remoção só será feita após
                    tocar no pacote encontrado.
                  </p>
                </div>
              </div>
            ) : sessionPackages.length ? (
              <div className="grid min-h-full place-items-center px-5 py-10 text-center">
                <div>
                  <span
                    className="mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-2xl font-bold text-amber-800"
                    aria-hidden="true"
                  >
                    ?
                  </span>
                  <h3 className="mt-4 text-xl font-bold">Código não encontrado</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                    Confira o código digitado ou apague a busca para ver todas
                    as leituras deste lote.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid min-h-full place-items-center px-5 py-10 text-center">
                <div>
                  <span
                    className="mx-auto grid size-14 place-items-center rounded-full bg-slate-200 text-2xl font-bold text-slate-600"
                    aria-hidden="true"
                  >
                    0
                  </span>
                  <h3 className="mt-4 text-xl font-bold">Nenhum pacote no lote</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                    Volte à bipagem para adicionar novos rastreios.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {showMobileBatchHistory && mobileImmersiveSession ? (
        <section
          ref={mobileBatchHistoryRef}
          tabIndex={-1}
          className="fixed inset-0 z-[100] flex h-dvh flex-col overflow-hidden bg-slate-100 text-slate-950 xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-batch-history-title"
        >
          <header className="shrink-0 border-b border-slate-200 bg-white px-3 pb-3 pt-[calc(0.5rem+env(safe-area-inset-top))] shadow-sm">
            <div className="mx-auto flex w-full max-w-xl items-center gap-3">
              <button
                ref={mobileBatchHistoryInitialFocusRef}
                type="button"
                onClick={
                  selectedBatch
                    ? closeBatchFromMobileHistory
                    : closeMobileBatchHistory
                }
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"
              >
                <span aria-hidden="true">←</span>
                <span className="ml-1">
                  {selectedBatch ? "Histórico" : "Voltar"}
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <h2
                  id="mobile-batch-history-title"
                  className="truncate text-base font-bold"
                >
                  {selectedBatch ? "Detalhes do lote" : "Histórico e romaneios"}
                </h2>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  {selectedBatch
                    ? getBatchCode(selectedBatch)
                    : `${sortedBatches.length} lote${sortedBatches.length === 1 ? " finalizado" : "s finalizados"}`}
                </p>
              </div>
            </div>
          </header>

          <div className="mx-auto min-h-0 w-full max-w-xl flex-1 overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]">
            {selectedBatch ? (
              <div className="space-y-3">
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <p>
                      <span className="font-bold text-slate-700">Loja:</span>{" "}
                      {getCatalogStoreName(selectedBatch.loja_id)}
                    </p>
                    <p>
                      <span className="font-bold text-slate-700">Marketplace:</span>{" "}
                      {selectedBatch.marketplace}
                    </p>
                    <p>
                      <span className="font-bold text-slate-700">Operação:</span>{" "}
                      {getOperationLabel(selectedBatch.tipo_operacao)}
                    </p>
                    <p>
                      <span className="font-bold text-slate-700">Melhor Envio:</span>{" "}
                      {selectedBatch.melhor_envio ? "Sim" : "Não"}
                    </p>
                    <p>
                      <span className="font-bold text-slate-700">Transportadora:</span>{" "}
                      {selectedBatch.transportadora || "Sem transportadora"}
                    </p>
                    <p>
                      <span className="font-bold text-slate-700">Finalizado:</span>{" "}
                      {selectedBatch.finalizado_em
                        ? formatPackageDate(selectedBatch.finalizado_em)
                        : "Sem data"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openStoreRomaneio(selectedBatch)}
                    className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white"
                  >
                    Abrir romaneio da loja
                  </button>
                </article>

                <div className="space-y-2">
                  <h3 className="px-1 text-sm font-bold text-slate-950">
                    Pacotes ({selectedBatchPackages.length})
                  </h3>
                  {visibleSelectedBatchPackages.length ? (
                    <ol className="space-y-2">
                      {visibleSelectedBatchPackages.map((item, index) => (
                        <li
                          key={`mobile-history-package-${item.id}`}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm"
                        >
                          <span className="mr-2 text-sm font-bold text-slate-400">
                            {index + 1}.
                          </span>
                          <span className="break-all font-mono text-sm font-bold text-slate-950">
                            {item.codigo_rastreio}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <EmptyState>Nenhum pacote encontrado para este lote.</EmptyState>
                  )}
                  {visibleSelectedBatchPackages.length <
                  selectedBatchPackages.length ? (
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleSelectedBatchPackageCount((current) =>
                          Math.min(
                            current + BATCH_PACKAGE_PAGE_SIZE,
                            selectedBatchPackages.length,
                          ),
                        )
                      }
                      className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700"
                    >
                      Mostrar mais pacotes ({visibleSelectedBatchPackages.length} de{" "}
                      {selectedBatchPackages.length})
                    </button>
                  ) : null}
                </div>
              </div>
            ) : sortedBatches.length ? (
              <div className="space-y-3">
                {visibleBatches.map((batch) => (
                  <article
                    key={`mobile-history-${batch.id}`}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <p className="break-all font-mono text-base font-bold text-slate-950">
                      {getBatchCode(batch)}
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-5 text-slate-700">
                      {getCatalogStoreName(batch.loja_id)} · {batch.marketplace} ·{" "}
                      {getOperationLabel(batch.tipo_operacao)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {batch.finalizado_em
                        ? formatPackageDate(batch.finalizado_em)
                        : "Sem data de finalização"}{" "}
                      · {batch.total_pacotes} pacote{batch.total_pacotes === 1 ? "" : "s"}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => openBatchFromMobileHistory(batch.id)}
                        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"
                      >
                        Ver detalhes
                      </button>
                      <button
                        type="button"
                        onClick={() => openStoreRomaneio(batch)}
                        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-3 text-sm font-bold text-white"
                      >
                        Romaneio da loja
                      </button>
                    </div>
                  </article>
                ))}
                {visibleBatches.length < sortedBatches.length ? (
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleBatchCount((current) =>
                        Math.min(
                          current + BATCH_HISTORY_PAGE_SIZE,
                          sortedBatches.length,
                        ),
                      )
                    }
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700"
                  >
                    Mostrar mais lotes ({visibleBatches.length} de{" "}
                    {sortedBatches.length})
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="grid min-h-full place-items-center px-5 py-10 text-center">
                <div>
                  <span
                    className="mx-auto grid size-14 place-items-center rounded-full bg-slate-200 text-2xl font-bold text-slate-600"
                    aria-hidden="true"
                  >
                    0
                  </span>
                  <h3 className="mt-4 text-xl font-bold">Nenhum lote finalizado</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                    Os lotes finalizados e seus romaneios aparecerão aqui.
                  </p>
                </div>
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2 shadow-[0_-14px_36px_-24px_rgba(15,23,42,0.55)]">
            <div className="mx-auto w-full max-w-xl pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={
                  selectedBatch
                    ? closeBatchFromMobileHistory
                    : closeMobileBatchHistory
                }
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white"
              >
                {selectedBatch ? "Voltar ao histórico" : "Voltar à bipagem"}
              </button>
            </div>
          </footer>
        </section>
      ) : null}

      {showOnlySessionDuplicates ? (
        <section
          ref={duplicateManagerRef}
          tabIndex={-1}
          className="fixed inset-0 z-[100] flex h-dvh flex-col overflow-hidden bg-slate-100 text-slate-950 xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="duplicate-manager-title"
        >
          <header className="shrink-0 border-b border-slate-200 bg-white px-3 pb-3 pt-[calc(0.5rem+env(safe-area-inset-top))] shadow-sm">
            <div className="mx-auto flex w-full max-w-xl items-center gap-3">
              <button
                ref={duplicateManagerInitialFocusRef}
                type="button"
                onClick={closeDuplicatePackages}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"
              >
                <span aria-hidden="true">←</span>
                <span className="ml-1">Voltar</span>
              </button>
              <div className="min-w-0 flex-1">
                <h2
                  id="duplicate-manager-title"
                  className="truncate text-base font-bold"
                >
                  Corrigir duplicados
                </h2>
                <p className="mt-0.5 text-xs font-semibold text-rose-700">
                  {duplicateExcessCount}{" "}
                  {duplicateExcessCount === 1 ? "repetição" : "repetições"}{" "}
                  para remover
                </p>
              </div>
              <span
                className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl bg-rose-700 px-2 text-sm font-bold text-white"
                aria-label={`${duplicateExcessCount} repetições pendentes`}
              >
                {duplicateExcessCount}
              </span>
            </div>
          </header>

          <div className="mx-auto min-h-0 w-full max-w-xl flex-1 overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]">
            {sessionPackageActionError ? (
              <p
                className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold leading-5 text-rose-800"
                role="alert"
              >
                {sessionPackageActionError}
              </p>
            ) : null}
            {duplicateSessionPackages.length ? (
              <div className="space-y-3">
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold leading-5 text-rose-800">
                  Escolha uma ocorrência de cada código repetido para remover do
                  lote. A câmera fica pausada enquanto você faz a correção.
                </p>
                {duplicateSessionPackages.map((item) => {
                  const packageNumber = sessionPackageNumbers.get(item.id);

                  return (
                    <article
                      key={`duplicate-${item.id}`}
                      className="rounded-2xl border border-rose-300 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-slate-400">
                            Pacote {packageNumber}
                          </p>
                          <p
                            className="mt-2 break-all font-mono text-base font-bold leading-6 text-slate-950"
                            title={item.codigo_rastreio}
                          >
                            {item.codigo_rastreio}
                          </p>
                          <p className="mt-1 text-xs font-medium text-slate-500">
                            {formatPackageDate(item.data_hora_bipagem)}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-rose-100 px-2.5 py-1 text-[0.65rem] font-bold text-rose-800">
                          DUPLICADO
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSessionPackage(item)}
                        disabled={sessionMutationLocked}
                        className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-rose-700 px-4 text-sm font-bold text-white transition disabled:cursor-wait disabled:bg-slate-300"
                        aria-label={`Remover repetição ${item.codigo_rastreio}`}
                      >
                        {savingSession
                          ? "Removendo..."
                          : "Remover esta repetição"}
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-full place-items-center px-5 py-10 text-center">
                <div>
                  <span
                    className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-700"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <h3 className="mt-4 text-xl font-bold">
                    Duplicados corrigidos
                  </h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                    Não há mais repetições pendentes neste lote.
                  </p>
                </div>
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2 shadow-[0_-14px_36px_-24px_rgba(15,23,42,0.55)]">
            <div className="mx-auto w-full max-w-xl pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={closeDuplicatePackages}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white"
              >
                {hasSessionDuplicates
                  ? "Voltar à bipagem"
                  : "Continuar bipagem"}
              </button>
            </div>
          </footer>
        </section>
      ) : null}

      {selectedBatch && !showMobileBatchHistory ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-modal-title"
        >
          <div className="flex max-h-[88vh] w-full max-w-5xl flex-col rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-5 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-mono text-sm font-semibold text-teal-700">
                  {getBatchCode(selectedBatch)}
                </p>
                <h2
                  id="batch-modal-title"
                  className="mt-1 text-xl font-semibold text-slate-950"
                >
                  Detalhes do lote
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedBatch.finalizado_em
                    ? formatPackageDate(selectedBatch.finalizado_em)
                    : "Lote sem finalizacao"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openStoreRomaneio(selectedBatch)}
                  className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Imprimir romaneio da loja
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedHistoryBatchId("")}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto p-5">
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <div>
                  <span className="font-semibold text-slate-700">Loja:</span>{" "}
                  {getCatalogStoreName(selectedBatch.loja_id)}
                </div>
                <div>
                  <span className="font-semibold text-slate-700">
                    Marketplace:
                  </span>{" "}
                  {selectedBatch.marketplace}
                </div>
                <div>
                  <span className="font-semibold text-slate-700">
                    Operacao:
                  </span>{" "}
                  {getOperationLabel(selectedBatch.tipo_operacao)}
                </div>
                <div>
                  <span className="font-semibold text-slate-700">
                    Melhor Envio:
                  </span>{" "}
                  {selectedBatch.melhor_envio ? "Sim" : "Nao"}
                </div>
                <div>
                  <span className="font-semibold text-slate-700">
                    Transportadora:
                  </span>{" "}
                  {selectedBatch.transportadora || "Sem transportadora"}
                </div>
                <div>
                  <span className="font-semibold text-slate-700">Total:</span>{" "}
                  {selectedBatchPackages.length} pacotes
                </div>
              </div>

              <div className="mt-5">
                {selectedBatchPackages.length ? (
                  <>
                    <ol className="space-y-2">
                      {visibleSelectedBatchPackages.map((item, index) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-3"
                        >
                          <div className="min-w-0">
                            <span className="mr-3 text-sm font-semibold text-slate-400">
                              {index + 1}.
                            </span>
                            <span className="break-all font-mono text-sm font-semibold text-slate-950">
                              {item.codigo_rastreio}
                            </span>
                          </div>
                          <StatusBadge status={item.status} />
                        </li>
                      ))}
                    </ol>
                    {visibleSelectedBatchPackages.length <
                    selectedBatchPackages.length ? (
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleSelectedBatchPackageCount((current) =>
                            Math.min(
                              current + BATCH_PACKAGE_PAGE_SIZE,
                              selectedBatchPackages.length,
                            ),
                          )
                        }
                        className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                      >
                        Mostrar mais pacotes (
                        {visibleSelectedBatchPackages.length} de{" "}
                        {selectedBatchPackages.length})
                      </button>
                    ) : null}
                  </>
                ) : (
                  <EmptyState>Nenhum pacote encontrado para este lote.</EmptyState>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={showClearSessionConfirm}
        title="Descartar lote"
        message="Deseja descartar o lote atual e remover os pacotes bipados nele?"
        cancelLabel="Voltar"
        confirmLabel="Descartar lote"
        tone="danger"
        onCancel={() => {
          setShowClearSessionConfirm(false);
          focusCodeField();
        }}
        onConfirm={confirmClearSession}
      />

      <ConfirmDialog
        open={showDuplicateFinalizeDialog}
        title="Duplicados no lote"
        message={DUPLICATE_FINALIZE_MESSAGE}
        cancelLabel="Voltar"
        confirmLabel="Entendi"
        tone="danger"
        onCancel={() => {
          setShowDuplicateFinalizeDialog(false);
          focusCodeField();
        }}
        onConfirm={() => {
          setShowDuplicateFinalizeDialog(false);
          focusCodeField();
        }}
      />

      {cancellationCandidates.length ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="choose-cancellation-package-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-rose-600">
              Rastreio encontrado em mais de uma loja
            </p>
            <h2
              id="choose-cancellation-package-title"
              className="mt-2 text-xl font-bold text-slate-950"
            >
              Qual pacote deseja cancelar?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Confira a loja e o marketplace. Nenhuma opção será escolhida
              automaticamente.
            </p>
            <div className="mt-5 grid max-h-[min(55dvh,28rem)] gap-3 overflow-y-auto pr-1">
              {cancellationCandidates.map((candidate, candidateIndex) => (
                <button
                  key={candidate.id}
                  ref={candidateIndex === 0 ? firstCancellationCandidateRef : undefined}
                  type="button"
                  onClick={() => addPendingCancellation(candidate)}
                  className="grid gap-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-rose-400 hover:bg-rose-50 focus:outline-none focus:ring-4 focus:ring-rose-100"
                >
                  <span className="text-base font-bold text-slate-950">
                    {getCatalogStoreName(candidate.loja_id)}
                  </span>
                  <span className="text-sm font-semibold text-rose-700">
                    {candidate.marketplace}
                  </span>
                  <span className="break-all font-mono text-xs text-slate-500">
                    {candidate.codigo_rastreio}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setCancellationCandidates([]);
                focusCodeField();
              }}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-100"
            >
              Voltar sem adicionar
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={showFinalizeCancellationConfirm}
        title={`Cancelar ${pendingCancellations.length} ${
          pendingCancellations.length === 1 ? "pacote" : "pacotes"
        }?`}
        message={
          <div className="grid gap-2">
            <p>
              Esta ação cancelará todos os rastreios da lista, mesmo quando
              pertencerem a lojas diferentes.
            </p>
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800">
              Motivo: {cancellationReason.trim()}
            </p>
          </div>
        }
        cancelLabel="Revisar lista"
        confirmLabel="Cancelar todos"
        tone="danger"
        onCancel={() => {
          setShowFinalizeCancellationConfirm(false);
          focusCodeField();
        }}
        onConfirm={finalizePendingCancellations}
      />

      <ConfirmDialog
        open={showExitCancellationConfirm}
        title="Sair do cancelamento em lote?"
        message="Há informações preenchidas. Ao sair, o rastreio e as justificativas em aberto serão limpos."
        cancelLabel="Continuar"
        confirmLabel="Sair"
        tone="danger"
        onCancel={() => {
          setShowExitCancellationConfirm(false);
          focusCodeField();
        }}
        onConfirm={exitCancellationMode}
      />

      {pendingSessionCancelPackage ? (
        <div
          className="app-scroll-region fixed inset-0 z-50 grid overflow-y-auto bg-slate-950/45 px-3 py-4 sm:place-items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-package-title"
        >
          <div className="app-scroll-region my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl sm:max-h-[calc(100dvh-3rem)]">
            <h2
              id="cancel-package-title"
              className="text-lg font-semibold text-slate-950"
            >
              Cancelar pacote
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Informe a justificativa para cancelar{" "}
              <span className="font-mono font-semibold text-slate-950">
                {pendingSessionCancelPackage.codigo_rastreio}
              </span>
              .
            </p>
            <label className="mt-4 grid gap-2 text-sm font-medium text-slate-700">
              Justificativa
              <textarea
                value={sessionCancelReason}
                onChange={(event) => {
                  setSessionCancelReason(event.target.value);
                  setSessionCancelError("");
                }}
                className="min-h-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-rose-600 focus:ring-4 focus:ring-rose-100"
                placeholder="Obrigatória"
                required
              />
            </label>
            {sessionCancelError ? (
              <FeedbackMessage tone="warning">
                {sessionCancelError}
              </FeedbackMessage>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  if (savingCancellation) {
                    return;
                  }
                  setPendingSessionCancelPackage(null);
                  setSessionCancelReason("");
                  setSessionCancelError("");
                  focusCodeField();
                }}
                disabled={savingCancellation}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-100 disabled:cursor-wait disabled:bg-slate-100 disabled:text-slate-400"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmSessionPackageCancellation}
                disabled={savingCancellation}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white transition hover:bg-rose-800 focus:outline-none focus:ring-4 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancelar pacote
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
