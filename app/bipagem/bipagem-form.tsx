"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  Badge,
  ConfirmDialog,
  EmptyState,
  FeedbackMessage,
  MelhorEnvioBadge,
  OperationBadge,
  StatusBadge,
} from "@/app/_components/ui";
import type {
  DispatchPackage,
  OperationType,
  PackageCancellation,
} from "@/app/_lib/mock-data";
import {
  formatPackageDate,
  getOperationLabel,
  normalizeTrackingCode,
} from "@/app/_lib/mock-data";
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
  getSessaoBipagemAbertaComItens,
  type ItemSessaoBipagemRow,
  mapItemSessaoRowToDispatchPackage,
  removerItemSessaoBipagem,
} from "@/lib/database";

type Notice = {
  type: "success" | "warning" | "danger" | "neutral";
  text: string;
};

type PendingCancellationItem = {
  pacote: DispatchPackage;
  justificativa_individual: string;
};

const nowIso = () => new Date().toISOString();
const DUPLICATE_SESSION_WARNING =
  "Existem pacotes duplicados nesta sessão. Remova os duplicados para finalizar.";
const DUPLICATE_FINALIZE_MESSAGE =
  "Não é possível finalizar a bipagem com pacotes duplicados. Exclua os pacotes repetidos antes de finalizar.";

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function BipagemForm() {
  const codeRef = useRef<HTMLInputElement>(null);
  const {
    catalogs,
    packages,
    allPackages,
    batches,
    cancellations,
    loading,
    error,
    reload,
  } = useSupabaseDispatchData();
  const activePackages = packages;
  const [lojaId, setLojaId] = useState("");
  const [marketplace, setMarketplace] = useState("");
  const [tipoOperacao, setTipoOperacao] = useState<OperationType | "">("");
  const [melhorEnvio, setMelhorEnvio] = useState(false);
  const [transportadora, setTransportadora] = useState("");
  const [codigoRastreio, setCodigoRastreio] = useState("");
  const [activeBatchId, setActiveBatchId] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sessionPackages, setSessionPackages] = useState<DispatchPackage[]>([]);
  const [selectedHistoryBatchId, setSelectedHistoryBatchId] = useState("");
  const [cancellationMode, setCancellationMode] = useState(false);
  const [showCancellationConfirm, setShowCancellationConfirm] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [nextIndividualReason, setNextIndividualReason] = useState("");
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
  const [pendingSessionCancelPackage, setPendingSessionCancelPackage] =
    useState<DispatchPackage | null>(null);
  const [sessionCancelReason, setSessionCancelReason] = useState("");
  const [sessionCancelError, setSessionCancelError] = useState("");
  const [checkingPackage, setCheckingPackage] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [savingCancellation, setSavingCancellation] = useState(false);

  const activeStores = catalogs.stores.filter(
    (item) => item.status !== "Inativa",
  );
  const activeMarketplaces = catalogs.marketplaces.filter(
    (item) => item.status !== "Inativo",
  );
  const activeCarriers = catalogs.carriers.filter(
    (item) => item.status !== "Inativa",
  );
  const firstActiveStoreId = activeStores[0]?.id ?? "";
  const firstActiveMarketplaceName = activeMarketplaces[0]?.name ?? "";
  const selectedLojaId = activeStores.some((item) => item.id === lojaId)
    ? lojaId
    : firstActiveStoreId;
  const selectedMarketplace = activeMarketplaces.some(
    (item) => item.name === marketplace,
  )
    ? marketplace
    : firstActiveMarketplaceName;
  const selectedMarketplaceItem = activeMarketplaces.find(
    (item) => item.name === selectedMarketplace,
  );
  const selectedCarrierItem = activeCarriers.find(
    (item) => item.name === transportadora,
  );
  const sessionOpen = Boolean(activeBatchId);
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
  const selectedBatchPackages = selectedBatch
    ? allPackages.filter((item) => item.lote_id === selectedBatch.id)
    : [];
  const duplicateSessionCodes = useMemo(() => {
    const counts = new Map<string, number>();

    for (const item of sessionPackages) {
      const normalizedCode = normalizeTrackingCode(item.codigo_rastreio);
      counts.set(normalizedCode, (counts.get(normalizedCode) ?? 0) + 1);
    }

    return new Set(
      Array.from(counts)
        .filter(([, count]) => count > 1)
        .map(([code]) => code),
    );
  }, [sessionPackages]);
  const duplicateSessionCodeList = useMemo(
    () => Array.from(duplicateSessionCodes).sort(),
    [duplicateSessionCodes],
  );
  const sessionPackageOrder = useMemo(() => {
    return new Map(
      [...sessionPackages]
        .sort(
          (first, second) =>
            first.data_hora_bipagem.localeCompare(second.data_hora_bipagem) ||
            first.id.localeCompare(second.id),
        )
        .map((item, index) => [item.id, index + 1]),
    );
  }, [sessionPackages]);
  const hasSessionDuplicates = duplicateSessionCodes.size > 0;
  const latestSessionPackage = sessionPackages[0] ?? null;
  const submitDisabled =
    loading ||
    loadingOpenSession ||
    savingCancellation ||
    savingSession ||
    checkingPackage;
  const finalizeDisabled =
    hasSessionDuplicates ||
    loading ||
    loadingOpenSession ||
    savingSession ||
    checkingPackage;

  useEffect(() => {
    window.setTimeout(() => {
      if (!lojaId && firstActiveStoreId) {
        setLojaId(firstActiveStoreId);
      }

      if (!marketplace && firstActiveMarketplaceName) {
        setMarketplace(firstActiveMarketplaceName);
      }
    }, 0);
  }, [firstActiveMarketplaceName, firstActiveStoreId, lojaId, marketplace]);

  useEffect(() => {
    if (loading) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setLoadingOpenSession(true);

      void getSessaoBipagemAbertaComItens()
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
        setMarketplace(sessao.marketplace?.nome ?? sessao.marketplace_id);
        setTipoOperacao(sessao.tipo_operacao);
        setMelhorEnvio(sessao.melhor_envio);
        setTransportadora(sessao.transportadora?.nome ?? "");
        setActiveBatchId(sessao.id);
        setSessionPackages(
          itens.map((item) => mapItemSessaoRowToDispatchPackage(item, sessao)),
        );
        setNotice({
          type: "neutral",
          text: "Bipagem em andamento restaurada do Supabase.",
        });
        setLoadingOpenSession(false);
        })
        .catch((openSessionError) => {
        if (cancelled) {
          return;
        }

        setNotice({
          type: "danger",
          text: `Erro ao carregar sessao aberta: ${formatDatabaseError(
            openSessionError,
          )}`,
        });
        setLoadingOpenSession(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [loading]);

  function getCatalogStoreName(id: string) {
    return catalogs.stores.find((store) => store.id === id)?.name ?? id;
  }

  function getBatchCode(batch: { id: string; codigo_lote?: string | null }) {
    return batch.codigo_lote || `LOTE-${batch.id.slice(0, 8).toUpperCase()}`;
  }

  function openBatchRomaneio(batchId: string) {
    window.open(`/romaneio/${batchId}`, "_blank", "noopener,noreferrer");
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

  function mapSessionItemsToPackages(
    itens: ItemSessaoBipagemRow[],
    sessaoId = activeBatchId,
  ): DispatchPackage[] {
    return itens.map((item) => ({
      id: item.id,
      lote_id: sessaoId,
      loja_id: selectedLojaId,
      codigo_rastreio: item.codigo_normalizado,
      marketplace: selectedMarketplace,
      melhor_envio: melhorEnvio,
      transportadora: melhorEnvio ? transportadora : null,
      tipo_operacao: tipoOperacao || "postagem",
      status: "Pendente na sessão",
      data_hora_bipagem: item.criado_em,
      criado_em: item.criado_em,
    }));
  }

  function focusCodeField() {
    window.setTimeout(() => codeRef.current?.focus({ preventScroll: true }), 0);
  }

  function resetSessionConfig() {
    setSessionPackages([]);
    setActiveBatchId("");
    setLojaId(firstActiveStoreId);
    setMarketplace(firstActiveMarketplaceName);
    setTipoOperacao("");
    setMelhorEnvio(false);
    setTransportadora("");
    setCodigoRastreio("");
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
      return "Selecione a loja antes de iniciar a bipagem.";
    }

    if (!selectedMarketplace) {
      return "Selecione o marketplace antes de iniciar a bipagem.";
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

    const timestamp = nowIso();
    const sessao = await createSessaoBipagem({
      loja_id: selectedLojaId,
      marketplace_id: selectedMarketplaceItem.id,
      tipo_operacao: selectedOperation,
      melhor_envio: melhorEnvio,
      transportadora_id: melhorEnvio ? selectedCarrierItem?.id ?? null : null,
      status: "aberta",
      iniciada_em: timestamp,
    });

    setActiveBatchId(sessao.id);

    return sessao.id;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const code = codigoRastreio.trim();
    if (cancellationMode) {
      void cancelPackageByCode(code);
      return;
    }

    const validationMessage = validateSessionConfig(code);
    if (validationMessage) {
      setNotice({ type: "warning", text: validationMessage });
      focusCodeField();
      return;
    }

    const selectedOperation = tipoOperacao as OperationType;
    const normalizedCode = normalizeTrackingCode(code);
    const duplicatedInSession = sessionPackages.some(
      (item) => normalizeTrackingCode(item.codigo_rastreio) === normalizedCode,
    );

    let duplicatedSavedPackage = null;
    setCheckingPackage(true);
    try {
      duplicatedSavedPackage = await getPacoteAtivoPorCodigo(normalizedCode);
    } catch (error) {
      setNotice({
        type: "danger",
        text: `Erro ao verificar duplicidade: ${formatDatabaseError(error)}`,
      });
      focusCodeField();
      return;
    } finally {
      setCheckingPackage(false);
    }

    if (duplicatedSavedPackage) {
      setNotice({
        type: "danger",
        text: "Pacote duplicado: este código já foi bipado em outro lote.",
      });
      setCodigoRastreio("");
      focusCodeField();
      return;
    }

    setSavingSession(true);

    try {
      const sessaoId = await ensureOpenSession(selectedOperation);
      const itens = await adicionarItemSessaoBipagem({
        sessao_id: sessaoId,
        codigo: normalizedCode,
      });

      setSessionPackages(mapSessionItemsToPackages(itens, sessaoId));
      setNotice({
        type: duplicatedInSession ? "warning" : "success",
        text: duplicatedInSession
          ? DUPLICATE_SESSION_WARNING
          : sessionOpen
            ? `Rastreio ${normalizedCode} adicionado ao lote.`
            : `Sessão iniciada no Supabase. Rastreio ${normalizedCode} adicionado ao lote.`,
      });
      setCodigoRastreio("");
    } catch (error) {
      setNotice({
        type: "danger",
        text: `Erro ao salvar pacote na sessao: ${formatDatabaseError(error)}`,
      });
    } finally {
      setSavingSession(false);
      focusCodeField();
    }
  }

  async function finishSession() {
    if (savingSession) {
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

    setSavingSession(true);

    try {
      const result = await finalizarSessaoBipagemAberta(activeBatchId);
      await reload();

      const batchCode = result?.codigo_lote || getBatchCode({ id: activeBatchId });
      setNotice({
        type: "success",
        text: `${result?.total_pacotes ?? sessionPackages.length} pacotes finalizados no lote ${batchCode}.`,
      });
      setSelectedHistoryBatchId(activeBatchId);
      resetSessionConfig();
    } catch (error) {
      setNotice({
        type: "danger",
        text: `Erro ao finalizar bipagem: ${formatDatabaseError(error)}`,
      });
    } finally {
      setSavingSession(false);
      focusCodeField();
    }
  }

  function clearSession() {
    if (!activeBatchId) {
      setNotice({ type: "neutral", text: "A sessão já está vazia." });
      focusCodeField();
      return;
    }

    setShowClearSessionConfirm(true);
  }

  async function confirmClearSession() {
    if (!activeBatchId || savingSession) {
      return;
    }

    setSavingSession(true);

    try {
      await cancelarSessaoBipagemAberta(activeBatchId);
      await reload();
      resetSessionConfig();
      setShowClearSessionConfirm(false);
      setNotice({ type: "neutral", text: "Sessão atual cancelada." });
    } catch (error) {
      setNotice({
        type: "danger",
        text: `Erro ao cancelar sessao: ${formatDatabaseError(error)}`,
      });
    } finally {
      setSavingSession(false);
      focusCodeField();
    }
  }

  function requestCancellationMode() {
    if (sessionPackages.length || sessionOpen) {
      setNotice({
        type: "warning",
        text: "Finalize ou cancele a sessão atual antes de entrar no modo de cancelamento.",
      });
      focusCodeField();
      return;
    }

    setShowCancellationConfirm(true);
  }

  function activateCancellationMode() {
    setShowCancellationConfirm(false);
    setCancellationMode(true);
    setCodigoRastreio("");
    setNotice({
      type: "warning",
      text: "Modo cancelamento ativo. Informe a justificativa geral antes de bipar cancelamentos.",
    });
    focusCodeField();
  }

  function requestExitCancellationMode() {
    if (
      codigoRastreio.trim() ||
      nextIndividualReason.trim() ||
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
    setShowCancellationConfirm(false);
    setShowExitCancellationConfirm(false);
    setCodigoRastreio("");
    setCancellationReason("");
    setNextIndividualReason("");
    setPendingCancellations([]);
    setNotice({ type: "neutral", text: "Modo cancelamento desativado." });
    focusCodeField();
  }

  async function cancelPackageByCode(code: string) {
    if (savingCancellation) {
      return;
    }

    const cleanGeneralReason = cancellationReason.trim();
    if (!cleanGeneralReason) {
      setNotice({
        type: "warning",
        text: "Informe a justificativa geral do cancelamento antes de bipar.",
      });
      focusCodeField();
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
    const activePackage = activePackages.find(
      (item) => normalizeTrackingCode(item.codigo_rastreio) === normalizedCode,
    );
    const anyPackage = allPackages.find(
      (item) => normalizeTrackingCode(item.codigo_rastreio) === normalizedCode,
    );
    const alreadyCanceled = cancellations.some(
      (item) => normalizeTrackingCode(item.codigo_pacote) === normalizedCode,
    );
    const alreadyQueued = pendingCancellations.some(
      (item) =>
        item.pacote.id === activePackage?.id ||
        normalizeTrackingCode(item.pacote.codigo_rastreio) === normalizedCode,
    );

    if (!anyPackage) {
      setNotice({
        type: "danger",
        text: "Pacote não encontrado. Nada foi cancelado.",
      });
      setCodigoRastreio("");
      focusCodeField();
      return;
    }

    if (!activePackage || alreadyCanceled) {
      setNotice({
        type: "warning",
        text: "Este pacote já foi cancelado anteriormente.",
      });
      setCodigoRastreio("");
      focusCodeField();
      return;
    }

    if (alreadyQueued) {
      setNotice({
        type: "warning",
        text: "Este pacote ja esta na lista temporaria de cancelamento.",
      });
      setCodigoRastreio("");
      focusCodeField();
      return;
    }

    setPendingCancellations((current) => [
      {
        pacote: activePackage,
        justificativa_individual: nextIndividualReason.trim(),
      },
      ...current,
    ]);
    setNotice({
      type: "success",
      text: `Pacote ${activePackage.codigo_rastreio} adicionado para cancelamento.`,
    });
    setCodigoRastreio("");
    setNextIndividualReason("");
    focusCodeField();
  }

  function updatePendingCancellationReason(
    packageId: string,
    justification: string,
  ) {
    setPendingCancellations((current) =>
      current.map((item) =>
        item.pacote.id === packageId
          ? { ...item, justificativa_individual: justification }
          : item,
      ),
    );
  }

  function removePendingCancellation(packageId: string) {
    setPendingCancellations((current) =>
      current.filter((item) => item.pacote.id !== packageId),
    );
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
      focusCodeField();
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

    setSavingCancellation(true);

    try {
      const savedRows = await finalizarCancelamentosEmLote(
        pendingCancellations.map((item) => ({
          pacote_id: item.pacote.id,
          justificativa_geral: cleanGeneralReason,
          justificativa_individual: item.justificativa_individual,
        })),
      );
      const savedByPackageId = new Map(
        savedRows.map((item) => [item.pacote_id ?? "", item]),
      );
      const records = pendingCancellations.map((item) => {
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
      setCancellationReason("");
      setNextIndividualReason("");
      setCodigoRastreio("");
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
      focusCodeField();
    }
  }


  function cancelSessionPackage(item: DispatchPackage) {
    setPendingSessionCancelPackage(item);
    setSessionCancelReason("");
    setSessionCancelError("");
  }

  async function removeSessionPackage(item: DispatchPackage) {
    if (!activeBatchId || savingSession) {
      return;
    }

    setSavingSession(true);

    try {
      const itens = await removerItemSessaoBipagem({
        itemId: item.id,
        status: "descartado",
      });
      setSessionPackages(mapSessionItemsToPackages(itens, activeBatchId));
      setNotice({
        type: "neutral",
        text: `Pacote ${item.codigo_rastreio} removido da sessão.`,
      });
    } catch (error) {
      setNotice({
        type: "danger",
        text: `Erro ao remover pacote da sessao: ${formatDatabaseError(error)}`,
      });
    } finally {
      setSavingSession(false);
      focusCodeField();
    }
  }

  async function confirmSessionPackageCancellation() {
    if (!pendingSessionCancelPackage || savingCancellation) {
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
      );
      const savedRows = await cancelarPacotes({
        cancelamentos: [
          {
            pacote_id: savedPackage?.id ?? null,
            codigo_pacote: savedPackage?.codigo ?? targetPackage.codigo_rastreio,
            loja_id: savedPackage?.loja_id ?? targetPackage.loja_id,
            marketplace_id:
              savedPackage?.marketplace_id ??
              getMarketplaceIdByName(targetPackage.marketplace),
            transportadora_id:
              savedPackage?.transportadora_id ??
              getCarrierIdByName(targetPackage.transportadora),
            sessao_id: savedPackage?.sessao_id ?? (activeBatchId || null),
            tipo_operacao: savedPackage?.tipo_operacao ?? targetPackage.tipo_operacao,
            melhor_envio: savedPackage?.melhor_envio ?? targetPackage.melhor_envio,
            justificativa_geral: cleanReason,
            justificativa_individual: null,
            bipado_em: savedPackage?.bipado_em ?? targetPackage.data_hora_bipagem,
            cancelado_em: canceledAt,
          },
        ],
        movimentacoes: [
          {
            pacote_id: savedPackage?.id ?? null,
            loja_id: savedPackage?.loja_id ?? targetPackage.loja_id,
            sessao_id: savedPackage?.sessao_id ?? (activeBatchId || null),
            tipo_movimentacao: "Cancelamento",
            descricao: `Pacote ${savedPackage?.codigo ?? targetPackage.codigo_rastreio} cancelado na sessao de bipagem.`,
            criada_em: canceledAt,
          },
        ],
      });

      record = {
        ...record,
        id: savedRows[0]?.id ?? record.id,
        pacote_id: savedRows[0]?.pacote_id ?? targetPackage.id,
      };
      const itens = await removerItemSessaoBipagem({
        itemId: targetPackage.id,
        status: "cancelado",
      });
      setSessionPackages(mapSessionItemsToPackages(itens, activeBatchId));
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
      className={`grid items-start gap-6 rounded-lg p-0 transition xl:grid-cols-[minmax(360px,0.92fr)_minmax(420px,1.08fr)] ${
        cancellationMode
          ? "border border-rose-200 bg-rose-50/70 p-4"
          : ""
      }`}
    >
      {loading || loadingOpenSession ? (
        <div className="xl:col-span-2">
          <FeedbackMessage tone="neutral">
            Carregando dados e sessao aberta do Supabase...
          </FeedbackMessage>
        </div>
      ) : null}

      {error ? (
        <div className="xl:col-span-2">
          <FeedbackMessage tone="danger">{error}</FeedbackMessage>
        </div>
      ) : null}

      {cancellationMode ? (
        <div className="xl:col-span-2 rounded-lg border border-rose-300 bg-rose-100 px-5 py-4 text-rose-950">
          <p className="text-lg font-bold tracking-normal">
            MODO CANCELAMENTO ATIVO
          </p>
          <p className="mt-1 text-sm font-medium leading-6">
            Bipe os pacotes, revise a lista e finalize todos os cancelamentos
            de uma vez.
          </p>
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="grid gap-6 self-start xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)] xl:grid-rows-[minmax(0,1fr)_auto]"
      >
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:min-h-0 xl:overflow-y-auto">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Configuração da sessão
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Configure uma vez. Depois do primeiro pacote, os dados ficam
                bloqueados até finalizar ou cancelar o lote.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={sessionOpen ? "green" : "neutral"}>
                {sessionOpen ? "Sessão aberta" : "Pronta para iniciar"}
              </Badge>
              {cancellationMode ? (
                <Badge tone="red">Cancelamento</Badge>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Loja
              <select
                value={selectedLojaId}
                onChange={(event) => setLojaId(event.target.value)}
                disabled={configLocked}
                className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                required
              >
                {activeStores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Marketplace
              <select
                value={selectedMarketplace}
                onChange={(event) => setMarketplace(event.target.value)}
                disabled={configLocked}
                className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                required
              >
                {activeMarketplaces.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
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
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Transportadora
                <select
                  value={transportadora}
                  onChange={(event) => setTransportadora(event.target.value)}
                  disabled={configLocked}
                  required
                  className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">Selecione a transportadora</option>
                  {activeCarriers.map((carrier) => (
                    <option key={carrier.id} value={carrier.name}>
                      {carrier.name}
                    </option>
                  ))}
                </select>
              </label>
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
              Sessão aberta. Para alterar loja, marketplace, operação ou Melhor
              Envio, finalize ou cancele a bipagem atual.
            </div>
          ) : null}
        </div>

        <div
          className={`rounded-lg border bg-white p-5 shadow-sm xl:sticky xl:bottom-6 xl:z-10 ${
            cancellationMode ? "border-rose-300" : "border-slate-200"
          }`}
        >
          {cancellationMode ? (
            <div className="mb-5 grid gap-4">
              <label className="grid gap-2 text-sm font-medium text-rose-900">
                Justificativa geral do cancelamento
                <textarea
                  value={cancellationReason}
                  onChange={(event) => setCancellationReason(event.target.value)}
                  className="min-h-24 rounded-md border border-rose-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-rose-600 focus:ring-4 focus:ring-rose-100"
                  placeholder="Exemplo: pedido removido da expedição"
                  required
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Justificativa individual do próximo pacote
                <input
                  value={nextIndividualReason}
                  onChange={(event) =>
                    setNextIndividualReason(event.target.value)
                  }
                  className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-rose-600 focus:ring-4 focus:ring-rose-100"
                  placeholder="Opcional"
                />
              </label>
            </div>
          ) : null}

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            {cancellationMode ? "Código para cancelamento" : "Código do pacote"}
            <input
              ref={codeRef}
              value={codigoRastreio}
              onChange={(event) => setCodigoRastreio(event.target.value)}
              className={`min-h-16 rounded-md border bg-white px-4 font-mono text-xl font-semibold tracking-normal text-slate-950 outline-none transition placeholder:text-slate-400 ${
                cancellationMode
                  ? "border-rose-300 focus:border-rose-600 focus:ring-4 focus:ring-rose-100"
                  : "border-slate-300 focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              }`}
              placeholder={
                cancellationMode
                  ? "Bipe o pacote que deseja cancelar"
                  : "Bipe ou digite o código do pacote"
              }
              autoComplete="off"
              autoFocus
              required
            />
          </label>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
            <button
              type="submit"
              disabled={submitDisabled}
              className={`inline-flex min-h-12 items-center justify-center rounded-md px-5 text-sm font-semibold text-white transition focus:outline-none focus:ring-4 ${
                cancellationMode
                  ? "bg-rose-700 hover:bg-rose-800 focus:ring-rose-100"
                  : "bg-slate-950 hover:bg-slate-800 focus:ring-slate-200"
              } ${submitDisabled ? "cursor-not-allowed opacity-70" : ""}`}
            >
              {cancellationMode ? "Adicionar a lista" : "Bipar pacote"}
            </button>
            {cancellationMode ? (
              <>
                <button
                  type="button"
                  onClick={finalizePendingCancellations}
                  disabled={savingCancellation || !pendingCancellations.length}
                  className="inline-flex min-h-12 items-center justify-center rounded-md bg-rose-700 px-5 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Finalizar cancelamentos
                </button>
                <button
                  type="button"
                  onClick={requestExitCancellationMode}
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-rose-300 bg-white px-5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus:ring-4 focus:ring-rose-100"
                >
                  Sair do modo cancelamento
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={finishSession}
                  disabled={finalizeDisabled}
                  className={`inline-flex min-h-12 items-center justify-center rounded-md px-5 text-sm font-semibold text-white transition focus:outline-none focus:ring-4 ${
                    finalizeDisabled
                      ? "cursor-not-allowed bg-slate-300 focus:ring-slate-100"
                      : "bg-teal-700 hover:bg-teal-800 focus:ring-teal-100"
                  }`}
                >
                  Finalizar Bipagem
                </button>
                <button
                  type="button"
                  onClick={clearSession}
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-100"
                >
                  Cancelar sessão
                </button>
                <button
                  type="button"
                  onClick={requestCancellationMode}
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-rose-300 bg-rose-50 px-5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-4 focus:ring-rose-100"
                >
                  Modo cancelar pacotes
                </button>
              </>
            )}
          </div>

          {notice ? (
            <div className="mt-4">
              <FeedbackMessage tone={notice.type}>{notice.text}</FeedbackMessage>
            </div>
          ) : null}

          {cancellationMode ? (
            <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-rose-950">
                  Pacotes para cancelar
                </h3>
                <Badge tone="red">{pendingCancellations.length} na lista</Badge>
              </div>

              {pendingCancellations.length ? (
                <div className="mt-3 space-y-3">
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
                          className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                        >
                          Remover
                        </button>
                      </div>
                      <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Justificativa individual
                        <input
                          value={item.justificativa_individual}
                          onChange={(event) =>
                            updatePendingCancellationReason(
                              item.pacote.id,
                              event.target.value,
                            )
                          }
                          className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-950 outline-none transition focus:border-rose-600 focus:ring-4 focus:ring-rose-100"
                          placeholder="Opcional"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3">
                  <EmptyState>
                    Nenhum pacote na lista. Bipe um pacote para preparar o
                    cancelamento.
                  </EmptyState>
                </div>
              )}
            </div>
          ) : null}

          {!cancellationMode && recentCancellations.length ? (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-950">
                Ultimos cancelamentos
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

      <div className="grid min-h-0 gap-6 self-start xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)] xl:grid-rows-[auto_minmax(0,1fr)]">
        <div className="flex max-h-[640px] min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:max-h-[52vh]">
          <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Pacotes bipados nesta sessão
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {sessionPackages.length} pacotes no lote atual.
              </p>
            </div>
            <StatusBadge status="Pendente na sessão" />
          </div>

          <div
            className={`mb-4 shrink-0 rounded-lg border px-4 py-3 ${
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
            <p className="mt-1 truncate font-mono text-lg font-semibold text-slate-950">
              {latestSessionPackage?.codigo_rastreio ?? "Aguardando bipagem"}
            </p>
          </div>

          {sessionPackages.length ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              {sessionHeader}
              {hasSessionDuplicates ? (
                <FeedbackMessage tone="danger">
                  {DUPLICATE_SESSION_WARNING} Códigos:{" "}
                  {duplicateSessionCodeList.join(", ")}.
                </FeedbackMessage>
              ) : null}
              <div className="min-h-0 overflow-y-auto pr-1">
                <ol className="space-y-2">
                  {sessionPackages.map((item) => {
                    const isDuplicate = duplicateSessionCodes.has(
                      normalizeTrackingCode(item.codigo_rastreio),
                    );
                    const packageNumber = sessionPackageOrder.get(item.id) ?? 1;

                    return (
                      <li
                        key={item.id}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-3 ${
                          isDuplicate
                            ? "border-rose-300 bg-rose-50"
                            : "border-slate-200"
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="mr-3 text-sm font-semibold text-slate-400">
                            {packageNumber}.
                          </span>
                          <span className="font-mono text-sm font-semibold text-slate-950">
                            {item.codigo_rastreio}
                          </span>
                          {isDuplicate ? (
                            <span className="ml-3 inline-flex min-h-7 items-center rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700">
                              Duplicado
                            </span>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => removeSessionPackage(item)}
                            className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                          >
                            Remover
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelSessionPackage(item)}
                            className="inline-flex min-h-9 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                          >
                            Cancelar
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          ) : (
            <EmptyState>Nenhum rastreio bipado nesta sessão.</EmptyState>
          )}
        </div>

        <div className="flex min-h-[320px] flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:min-h-0">
          <div className="mb-4 shrink-0">
            <h2 className="text-lg font-semibold text-slate-950">
              Histórico de lotes
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Abra um lote para ver somente os pacotes vinculados a ele.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {sortedBatches.length ? (
              <div className="space-y-3">
                {sortedBatches.map((batch) => (
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
                          onClick={() => setSelectedHistoryBatchId(batch.id)}
                          className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                        >
                          Abrir lote
                        </button>
                        <button
                          type="button"
                          onClick={() => openBatchRomaneio(batch.id)}
                          className="inline-flex min-h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800"
                        >
                          Romaneio
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>Nenhum lote finalizado.</EmptyState>
            )}
          </div>
        </div>
      </div>

      {selectedBatch ? (
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
                  Lote de bipagem
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
                  onClick={() => openBatchRomaneio(selectedBatch.id)}
                  className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Imprimir Romaneio
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
                  <ol className="space-y-2">
                    {selectedBatchPackages.map((item, index) => (
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
        title="Cancelar sessão"
        message="Deseja cancelar a sessão atual e descartar os pacotes bipados neste lote?"
        cancelLabel="Voltar"
        confirmLabel="Cancelar sessão"
        tone="danger"
        onCancel={() => {
          setShowClearSessionConfirm(false);
          focusCodeField();
        }}
        onConfirm={confirmClearSession}
      />

      <ConfirmDialog
        open={showDuplicateFinalizeDialog}
        title="Duplicados na sessão"
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

      <ConfirmDialog
        open={showCancellationConfirm}
        title="Ativar modo de cancelamento?"
        message="Você está entrando no modo de cancelamento. Os pacotes bipados aqui serão removidos dos pacotes ativos e enviados para Pacotes Cancelados."
        cancelLabel="Cancelar"
        confirmLabel="Ativar cancelamento"
        tone="danger"
        onCancel={() => {
          setShowCancellationConfirm(false);
          focusCodeField();
        }}
        onConfirm={activateCancellationMode}
      />

      <ConfirmDialog
        open={showExitCancellationConfirm}
        title="Sair do modo cancelamento?"
        message="Há informações preenchidas no modo cancelamento. Ao sair, o código e as justificativas em aberto serão limpos."
        cancelLabel="Continuar cancelando"
        confirmLabel="Sair do modo"
        tone="danger"
        onCancel={() => {
          setShowExitCancellationConfirm(false);
          focusCodeField();
        }}
        onConfirm={exitCancellationMode}
      />

      {pendingSessionCancelPackage ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-package-title"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
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
                  setPendingSessionCancelPackage(null);
                  setSessionCancelReason("");
                  setSessionCancelError("");
                  focusCodeField();
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-100"
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
