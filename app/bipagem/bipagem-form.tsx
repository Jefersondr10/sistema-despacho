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
  "Existem pacotes duplicados neste lote. Remova os duplicados para finalizar.";
const DUPLICATE_FINALIZE_MESSAGE =
  "NÃ£o Ã© possÃ­vel finalizar o lote com pacotes duplicados. Exclua os rastreios repetidos antes de finalizar.";

const BATCH_HISTORY_PAGE_SIZE = 40;
const BATCH_PACKAGE_PAGE_SIZE = 100;
const SESSION_PACKAGE_PAGE_SIZE = 200;

function mapPendingItemToPackage(
  item: ItemSessaoBipagemRow,
  {
    sessaoId,
    lojaId,
    marketplace,
    melhorEnvio,
    transportadora,
    tipoOperacao,
  }: {
    sessaoId: string;
    lojaId: string;
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
    marketplace,
    melhor_envio: melhorEnvio,
    transportadora,
    tipo_operacao: tipoOperacao,
    status: "Pendente na sessÃ£o",
    data_hora_bipagem: item.criado_em,
    criado_em: item.criado_em,
  };
}

function getStoreTrackingKey(storeId: string, trackingCode: string) {
  return `${storeId}\u0000${normalizeTrackingCode(trackingCode)}`;
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function BipagemForm() {
  const codeRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const {
    catalogs,
    packages,
    allPackages,
    batches,
    cancellations,
    loading,
    error,
    reload,
  } = useSupabaseDispatchData("bipagem");
  const activePackages = packages;
  const [lojaId, setLojaId] = useState("");
  const [marketplace, setMarketplace] = useState("");
  const [tipoOperacao, setTipoOperacao] = useState<OperationType | "">("");
  const [melhorEnvio, setMelhorEnvio] = useState(false);
  const [transportadora, setTransportadora] = useState("");
  const [activeBatchId, setActiveBatchId] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sessionPackages, setSessionPackages] = useState<DispatchPackage[]>([]);
  const [selectedHistoryBatchId, setSelectedHistoryBatchId] = useState("");
  const [cancellationMode, setCancellationMode] = useState(false);
  const [cancellationLojaId, setCancellationLojaId] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
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

  const databaseContext = useMemo(
    () => ({ userId: user?.id }),
    [user?.id],
  );

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
  const selectedLojaId =
    lojaId && (sessionOpen || activeStores.some((item) => item.id === lojaId))
      ? lojaId
      : "";
  const selectedCancellationLojaId = catalogs.stores.some(
    (item) => item.id === cancellationLojaId,
  )
    ? cancellationLojaId
    : "";
  const selectedMarketplace =
    marketplace &&
    (sessionOpen ||
      activeMarketplaces.some((item) => item.name === marketplace))
      ? marketplace
      : "";
  const selectedMarketplaceItem = activeMarketplaces.find(
    (item) => item.name === selectedMarketplace,
  );
  const selectedCarrierItem = activeCarriers.find(
    (item) => item.name === transportadora,
  );
  const configLocked = sessionOpen || cancellationMode;
  const cancellationStoreLocked = pendingCancellations.length > 0;
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
  const { allPackageByStoreAndCode, packagesByBatchId } = useMemo(() => {
    const packageByStoreAndCode = new Map<string, DispatchPackage>();
    const packageGroups = new Map<string, DispatchPackage[]>();

    for (const item of allPackages) {
      const lookupKey = getStoreTrackingKey(item.loja_id, item.codigo_rastreio);
      if (!packageByStoreAndCode.has(lookupKey)) {
        packageByStoreAndCode.set(lookupKey, item);
      }

      const batchPackages = packageGroups.get(item.lote_id) ?? [];
      batchPackages.push(item);
      packageGroups.set(item.lote_id, batchPackages);
    }

    return {
      allPackageByStoreAndCode: packageByStoreAndCode,
      packagesByBatchId: packageGroups,
    };
  }, [allPackages]);
  const activePackageByStoreAndCode = useMemo(() => {
    const index = new Map<string, DispatchPackage>();

    for (const item of activePackages) {
      const lookupKey = getStoreTrackingKey(item.loja_id, item.codigo_rastreio);
      if (!index.has(lookupKey)) {
        index.set(lookupKey, item);
      }
    }

    return index;
  }, [activePackages]);
  const canceledPackageIds = useMemo(
    () => new Set(cancellations.map((item) => item.pacote_id)),
    [cancellations],
  );
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
  const latestSessionPackage = sessionPackages[0] ?? null;
  const visibleSessionPackages = useMemo(
    () => sessionPackages.slice(0, visibleSessionPackageCount),
    [sessionPackages, visibleSessionPackageCount],
  );
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
    if (loading) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setLoadingOpenSession(true);

      void getSessaoBipagemAbertaComItens(databaseContext)
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
  }, [databaseContext, loading]);

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

  function getCatalogStoreName(id: string) {
    return catalogs.stores.find((store) => store.id === id)?.name ?? id;
  }

  function getBatchCode(batch: { id: string; codigo_lote?: string | null }) {
    return batch.codigo_lote || `LOTE-${batch.id.slice(0, 8).toUpperCase()}`;
  }

  function openBatchRomaneio(batchId: string) {
    window.open(`/romaneio/${batchId}`, "_blank", "noopener,noreferrer");
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

  function focusCodeField() {
    window.setTimeout(() => codeRef.current?.focus({ preventScroll: true }), 0);
  }

  function resetSessionConfig() {
    setSessionPackages([]);
    setActiveBatchId("");
    setLojaId("");
    setMarketplace("");
    setTipoOperacao("");
    setMelhorEnvio(false);
    setTransportadora("");
    setVisibleSessionPackageCount(SESSION_PACKAGE_PAGE_SIZE);
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
      return "Informe ou bipe o cÃ³digo do pacote.";
    }

   ×ŸtŞÚ$z{-®éÜj×¢ÆF—b6Æ74æÖSÒ&fÆW‚Ö–âÖ‚Õ³3#…ÒfÆW‚Ö6öÂ&÷VæFVBÓ'†Â&÷&FW"&÷&FW"×6ÆFRÓ#ó“&r×v†—FRÓb6†F÷rÕ³ó‡…óS…òÓ3'…÷&v&ƒRÃ#2ÃC"Ãã3‚•Ò†Ã¦Ö–âÖ‚Ó#à¢ÆF—b6Æ74æÖSÒ&Ö"ÓB6‡&–æ²Ó#à¢Æƒ"6Æ74æÖSÒ'FW‡BÖÆrföçB×6VÖ–&öÆBFW‡B×6ÆFRÓ“S#à¢†—7L;7&–6òFRÆ÷FW0¢Âöƒ#à¢Ç6Æ74æÖSÒ&×BÓFW‡B×6ÒFW‡B×6ÆFRÓS#à¢'&VÒÆ÷FR&fW"6öÖVçFR÷26÷FW2f–æ7VÆF÷2VÆRà¢Â÷à¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&Ö–âÖ‚ÓfÆW‚Ó÷fW&fÆ÷r×’ÖWFò"Ó#à¢·6÷'FVD&F6†W2æÆVæwF‚ò€¢ÆF—b6Æ74æÖSÒ'76R×’Ó2#à¢·f—6–&ÆT&F6†W2æÖ‚†&F6‚’Óâ€¢ÆF—`¢¶W“×¶&F6‚æ–GĞ¢6Æ74æÖSÒ'&÷VæFVBÖÆr&÷&FW"&÷&FW"×6ÆFRÓ#Ó2FW‡B×6ÒG&ç6—F–öâ†÷fW#¦&÷&FW"×6ÆFRÓ3 ¢à¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂvÓ2#à¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓ#à¢Ç6Æ74æÖSÒ&föçBÖÖöæòFW‡BÖ&6RföçB×6VÖ–&öÆBFW‡B×6ÆFRÓ“S#à¢¶vWD&F6„6öFR†&F6‚—Ğ¢Â÷à¢Ç6Æ74æÖSÒ&×BÓFW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×6ÆFRÓs#à¢¶vWD6FÆöu7F÷&TæÖR†&F6‚æÆö¦ö–B—Ò+r¶&F6‚æÖ&¶WGÆ6WÒ+w²"'Ğ¢¶vWD÷W&F–öäÆ&VÂ†&F6‚çF—õö÷W&6ò—Ğ¢Â÷à¢Ç6Æ74æÖSÒ&×BÓFW‡B×6ÒFW‡B×6ÆFRÓS#à¢¶&F6‚æf–æÆ—¦FõöVĞ¢òf÷&ÖE6¶vTFFR†&F6‚æf–æÆ—¦FõöVÒ¢¢&VÒ&W'Fò'Ğ¢Â÷à¢Ç6Æ74æÖSÒ&×BÓFW‡B×6ÒFW‡B×6ÆFRÓc#à¢¶&F6‚çF÷FÅ÷6÷FW7Ò¶&F6‚çF÷FÅ÷6÷FW2ÓÓÒò'6÷FR"¢'6÷FW2'Ğ¢Â÷à¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&vÓ"#à¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ÷Vä&F6„†—7F÷'’†&F6‚æ–B—Ğ¢6Æ74æÖSÒ&–æÆ–æRÖfÆW‚Ö–âÖ‚Ó’—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖÖB&÷&FW"&÷&FW"×6ÆFRÓ3&r×v†—FR‚Ó2FW‡B×‡2föçB×6VÖ–&öÆBFW‡B×6ÆFRÓsG&ç6—F–öâ†÷fW#¦&÷&FW"×6ÆFRÓC†÷fW#§FW‡B×6ÆFRÓ“S ¢à¢'&—"Æ÷FP¢Âö'WGFöãà¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ÷Vä&F6…&öÖæV–ò†&F6‚æ–B—Ğ¢6Æ74æÖSÒ&–æÆ–æRÖfÆW‚Ö–âÖ‚Ó’—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖÖB&r×6ÆFRÓ“S‚Ó2FW‡B×‡2föçB×6VÖ–&öÆBFW‡B×v†—FRG&ç6—F–öâ†÷fW#¦&r×6ÆFRÓƒ ¢à¢&öÖæV–ğ¢Âö'WGFöãà¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢’—Ğ¢·f—6–&ÆT&F6†W2æÆVæwF‚Â6÷'FVD&F6†W2æÆVæwF‚ò€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óà¢6WEf—6–&ÆT&F6„6÷VçB‚†7W'&VçB’Óà¢ÖF‚æÖ–â€¢7W'&VçB²$D4…ô„•5Dõ%•õtUõ4•¤RÀ¢6÷'FVD&F6†W2æÆVæwF‚À¢’À¢¢Ğ¢6Æ74æÖSÒ&–æÆ–æRÖfÆW‚Ö–âÖ‚ÓrÖgVÆÂ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖÖB&÷&FW"&÷&FW"×6ÆFRÓ3&r×v†—FR‚ÓBFW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×6ÆFRÓsG&ç6—F–öâ†÷fW#¦&÷&FW"×6ÆFRÓC†÷fW#§FW‡B×6ÆFRÓ“S ¢à¢Ö÷7G&"Ö—2Æ÷FW2‡·f—6–&ÆT&F6†W2æÆVæwF‡ÒFW²"'Ğ¢·6÷'FVD&F6†W2æÆVæwF‡Ò¢Âö'WGFöãà¢’¢çVÆÇĞ¢ÂöF—cà¢’¢€¢ÄV×G•7FFSäæVæ‡VÒÆ÷FRf–æÆ—¦FòãÂôV×G•7FFSà¢—Ğ¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢’¢çVÆÇĞ ¢·6VÆV7FVD&F6‚ò€¢ÆF—`¢6Æ74æÖSÒ&f—†VB–ç6WBÓ¢ÓSfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&r×6ÆFRÓ“SóCR‚ÓB’Ób ¢&öÆSÒ&F–Æör ¢&–ÖÖöFÃÒ'G'VR ¢&–ÖÆ&VÆÆVF'“Ò&&F6‚ÖÖöFÂ×F—FÆR ¢à¢ÆF—b6Æ74æÖSÒ&fÆW‚Ö‚Ö‚Õ³ƒ‡f…ÒrÖgVÆÂÖ‚×rÓW†ÂfÆW‚Ö6öÂ&÷VæFVBÖÆr&÷&FW"&÷&FW"×6ÆFRÓ#&r×v†—FR6†F÷r×†Â#à¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂvÓ2&÷&FW"Ö"&÷&FW"×6ÆFRÓ#ÓRÖC¦fÆW‚×&÷rÖC¦—FV×2×7F'BÖC¦§W7F–g’Ö&WGvVVâ#à¢ÆF—cà¢Ç6Æ74æÖSÒ&föçBÖÖöæòFW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×FVÂÓs#à¢¶vWD&F6„6öFR‡6VÆV7FVD&F6‚—Ğ¢Â÷à¢Æƒ ¢–CÒ&&F6‚ÖÖöFÂ×F—FÆR ¢6Æ74æÖSÒ&×BÓFW‡B×†ÂföçB×6VÖ–&öÆBFW‡B×6ÆFRÓ“S ¢à¢FWFÆ†W2FòÆ÷FP¢Âöƒ#à¢Ç6Æ74æÖSÒ&×BÓFW‡B×6ÒFW‡B×6ÆFRÓS#à¢·6VÆV7FVD&F6‚æf–æÆ—¦FõöVĞ¢òf÷&ÖE6¶vTFFR‡6VÆV7FVD&F6‚æf–æÆ—¦FõöVÒ¢¢$Æ÷FR6VÒf–æÆ—¦6ò'Ğ¢Â÷à¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&vÓ"#à¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ÷Vä&F6…&öÖæV–ò‡6VÆV7FVD&F6‚æ–B—Ğ¢6Æ74æÖSÒ&–æÆ–æRÖfÆW‚Ö–âÖ‚Ó—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖÖB&r×6ÆFRÓ“S‚ÓBFW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×v†—FRG&ç6—F–öâ†÷fW#¦&r×6ÆFRÓƒ ¢à¢–×&–Ö—"&öÖæV–ğ¢Âö'WGFöãà¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ6WE6VÆV7FVD†—7F÷'”&F6„–B‚""—Ğ¢6Æ74æÖSÒ&–æÆ–æRÖfÆW‚Ö–âÖ‚Ó—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖÖB&÷&FW"&÷&FW"×6ÆFRÓ3&r×v†—FR‚ÓBFW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×6ÆFRÓsG&ç6—F–öâ†÷fW#¦&÷&FW"×6ÆFRÓC†÷fW#§FW‡B×6ÆFRÓ“S ¢à¢fV6† ¢Âö'WGFöãà¢ÂöF—cà¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&Ö–âÖ‚Ó÷fW&fÆ÷r×’ÖWFòÓR#à¢ÆF—b6Æ74æÖSÒ&w&–BvÓ2FW‡B×6ÒÖC¦w&–BÖ6öÇ2Ó2#à¢ÆF—cà¢Ç7â6Æ74æÖSÒ&föçB×6VÖ–&öÆBFW‡B×6ÆFRÓs#äÆö¦£Â÷7ãç²"'Ğ¢¶vWD6FÆöu7F÷&TæÖR‡6VÆV7FVD&F6‚æÆö¦ö–B—Ğ¢ÂöF—cà¢ÆF—cà¢Ç7â6Æ74æÖSÒ&föçB×6VÖ–&öÆBFW‡B×6ÆFRÓs#à¢Ö&¶WGÆ6S ¢Â÷7ãç²"'Ğ¢·6VÆV7FVD&F6‚æÖ&¶WGÆ6WĞ¢ÂöF—cà¢ÆF—cà¢Ç7â6Æ74æÖSÒ&föçB×6VÖ–&öÆBFW‡B×6ÆFRÓs#à¢÷W&6ó ¢Â÷7ãç²"'Ğ¢¶vWD÷W&F–öäÆ&VÂ‡6VÆV7FVD&F6‚çF—õö÷W&6ò—Ğ¢ÂöF—cà¢ÆF—cà¢Ç7â6Æ74æÖSÒ&föçB×6VÖ–&öÆBFW‡B×6ÆFRÓs#à¢ÖVÆ†÷"Vçf–ó ¢Â÷7ãç²"'Ğ¢·6VÆV7FVD&F6‚æÖVÆ†÷%öVçf–òò%6–Ò"¢$æò'Ğ¢ÂöF—cà¢ÆF—cà¢Ç7â6Æ74æÖSÒ&föçB×6VÖ–&öÆBFW‡B×6ÆFRÓs#à¢G&ç7÷'FF÷& ¢Â÷7ãç²"'Ğ¢·6VÆV7FVD&F6‚çG&ç7÷'FF÷&ÇÂ%6VÒG&ç7÷'FF÷&'Ğ¢ÂöF—cà¢ÆF—cà¢Ç7â6Æ74æÖSÒ&föçB×6VÖ–&öÆBFW‡B×6ÆFRÓs#åF÷FÃ£Â÷7ãç²"'Ğ¢·6VÆV7FVD&F6…6¶vW2æÆVæwF‡Ò6÷FW0¢ÂöF—cà¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&×BÓR#à¢·6VÆV7FVD&F6…6¶vW2æÆVæwF‚ò€¢Ãà¢ÆöÂ6Æ74æÖSÒ'76R×’Ó"#à¢·f—6–&ÆU6VÆV7FVD&F6…6¶vW2æÖ‚†—FVÒÂ–æFW‚’Óâ€¢ÆÆ¢¶W“×¶—FVÒæ–GĞ¢6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâvÓ2&÷VæFVBÖÆr&÷&FW"&÷&FW"×6ÆFRÓ#‚Ó2’Ó2 ¢à¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓ#à¢Ç7â6Æ74æÖSÒ&×"Ó2FW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×6ÆFRÓC#à¢¶–æFW‚²Òà¢Â÷7ãà¢Ç7â6Æ74æÖSÒ&'&V²ÖÆÂföçBÖÖöæòFW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×6ÆFRÓ“S#à¢¶—FVÒæ6öF–võ÷&7G&V–÷Ğ¢Â÷7ãà¢ÂöF—cà¢Å7FGW4&FvR7FGW3×¶—FVÒç7FGW7Òóà¢ÂöÆ“à¢’—Ğ¢ÂööÃà¢·f—6–&ÆU6VÆV7FVD&F6…6¶vW2æÆVæwF‚À¢6VÆV7FVD&F6…6¶vW2æÆVæwF‚ò€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óà¢6WEf—6–&ÆU6VÆV7FVD&F6…6¶vT6÷VçB‚†7W'&VçB’Óà¢ÖF‚æÖ–â€¢7W'&VçB²$D4…õ4´tUõtUõ4•¤RÀ¢6VÆV7FVD&F6…6¶vW2æÆVæwF‚À¢’À¢¢Ğ¢6Æ74æÖSÒ&×BÓ2–æÆ–æRÖfÆW‚Ö–âÖ‚ÓrÖgVÆÂ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖÖB&÷&FW"&÷&FW"×6ÆFRÓ3&r×v†—FR‚ÓBFW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×6ÆFRÓsG&ç6—F–öâ†÷fW#¦&÷&FW"×6ÆFRÓC†÷fW#§FW‡B×6ÆFRÓ“S ¢à¢Ö÷7G&"Ö—26÷FW2€¢·f—6–&ÆU6VÆV7FVD&F6…6¶vW2æÆVæwF‡ÒFW²"'Ğ¢·6VÆV7FVD&F6…6¶vW2æÆVæwF‡Ò¢Âö'WGFöãà¢’¢çVÆÇĞ¢Âóà¢’¢€¢ÄV×G•7FFSäæVæ‡VÒ6÷FRVæ6öçG&Fò&W7FRÆ÷FRãÂôV×G•7FFSà¢—Ğ¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢’¢çVÆÇĞ ¢Ä6öæf—&ÔF–Æöp¢÷Vã×·6†÷t6ÆV%6W76–öä6öæf—&×Ğ¢F—FÆSÒ$FW66'F"Æ÷FR ¢ÖW76vSÒ$FW6V¦FW66'F"òÆ÷FRGVÂR&VÖ÷fW"÷26÷FW2&—F÷2æVÆSò ¢6æ6VÄÆ&VÃÒ%föÇF" ¢6öæf—&ÔÆ&VÃÒ$FW66'F"Æ÷FR ¢FöæSÒ&FævW" ¢öä6æ6VÃ×²‚’Óâ°¢6WE6†÷t6ÆV%6W76–öä6öæf—&Ò†fÇ6R“°¢fö7W46öFTf–VÆB‚“°¢×Ğ¢öä6öæf—&Ó×¶6öæf—&Ô6ÆV%6W76–öçĞ¢óà ¢Ä6öæf—&ÔF–Æöp¢÷Vã×·6†÷tGWÆ–6FTf–æÆ—¦TF–ÆöwĞ¢F—FÆSÒ$GWÆ–6F÷2æòÆ÷FR ¢ÖW76vS×´EUÄ”4DUôd”äÄ•¤UôÔU54tWĞ¢6æ6VÄÆ&VÃÒ%föÇF" ¢6öæf—&ÔÆ&VÃÒ$VçFVæF’ ¢FöæSÒ&FævW" ¢öä6æ6VÃ×²‚’Óâ°¢6WE6†÷tGWÆ–6FTf–æÆ—¦TF–Æör†fÇ6R“°¢fö7W46öFTf–VÆB‚“°¢×Ğ¢öä6öæf—&Ó×²‚’Óâ°¢6WE6†÷tGWÆ–6FTf–æÆ—¦TF–Æör†fÇ6R“°¢fö7W46öFTf–VÆB‚“°¢×Ğ¢óà ¢Ä6öæf—&ÔF–Æöp¢÷Vã×·6†÷tf–æÆ—¦T6æ6VÆÆF–öä6öæf—&×Ğ¢F—FÆS×¶6æ6VÆ"G·VæF–æt6æ6VÆÆF–öç2æÆVæwF‡ÒG°¢VæF–æt6æ6VÆÆF–öç2æÆVæwF‚ÓÓÒò'6÷FR"¢'6÷FW2 ¢ÓöĞ¢ÖW76vS×°¢ÆF—b6Æ74æÖSÒ&w&–BvÓ"#à¢Çà¢W7F:|:6ò6æ6VÆ,:FöF÷2÷2&7G&V–÷2FÆ—7FFÆö¦²"'Ğ¢Ç7G&öæsç¶vWD6FÆöu7F÷&TæÖR‡6VÆV7FVD6æ6VÆÆF–öäÆö¦–B—ÓÂ÷7G&öæsâà¢Â÷à¢Ç6Æ74æÖSÒ'&÷VæFVBÖÆr&r×&÷6RÓS‚Ó2’Ó"FW‡B×&÷6RÓƒ#à¢Ö÷F—fó¢¶6æ6VÆÆF–öå&V6öâçG&–Ò‚—Ğ¢Â÷à¢ÂöF—cà¢Ğ¢6æ6VÄÆ&VÃÒ%&Wf—6"Æ—7F ¢6öæf—&ÔÆ&VÃÒ$6æ6VÆ"FöF÷2 ¢FöæSÒ&FævW" ¢öä6æ6VÃ×²‚’Óâ°¢6WE6†÷tf–æÆ—¦T6æ6VÆÆF–öä6öæf—&Ò†fÇ6R“°¢fö7W46öFTf–VÆB‚“°¢×Ğ¢öä6öæf—&Ó×¶f–æÆ—¦UVæF–æt6æ6VÆÆF–öç7Ğ¢óà ¢Ä6öæf—&ÔF–Æöp¢÷Vã×·6†÷tW†—D6æ6VÆÆF–öä6öæf—&×Ğ¢F—FÆSÒ%6—"Fò6æ6VÆÖVçFòVÒÆ÷FSò ¢ÖW76vSÒ$Œ:–æf÷&Ö:|;VW2&VVæ6†–F2âò6—"Âò&7G&V–òR2§W7F–f–6F—f2VÒ&W'Fò6W,:6òÆ–×÷2â ¢6æ6VÄÆ&VÃÒ$6öçF–çV" ¢6öæf—&ÔÆ&VÃÒ%6—" ¢FöæSÒ&FævW" ¢öä6æ6VÃ×²‚’Óâ°¢6WE6†÷tW†—D6æ6VÆÆF–öä6öæf—&Ò†fÇ6R“°¢fö7W46öFTf–VÆB‚“°¢×Ğ¢öä6öæf—&Ó×¶W†—D6æ6VÆÆF–öäÖöFWĞ¢óà ¢·VæF–æu6W76–öä6æ6VÅ6¶vRò€¢ÆF—`¢6Æ74æÖSÒ&f—†VB–ç6WBÓ¢ÓSw&–BÆ6RÖ—FV×2Ö6VçFW"&r×6ÆFRÓ“SóCR‚ÓB’Ób ¢&öÆSÒ&F–Æör ¢&–ÖÖöFÃÒ'G'VR ¢&–ÖÆ&VÆÆVF'“Ò&6æ6VÂ×6¶vR×F—FÆR ¢à¢ÆF—b6Æ74æÖSÒ'rÖgVÆÂÖ‚×rÖÖB&÷VæFVBÖÆr&÷&FW"&÷&FW"×6ÆFRÓ#&r×v†—FRÓR6†F÷r×†Â#à¢Æƒ ¢–CÒ&6æ6VÂ×6¶vR×F—FÆR ¢6Æ74æÖSÒ'FW‡BÖÆrföçB×6VÖ–&öÆBFW‡B×6ÆFRÓ“S ¢à¢6æ6VÆ"6÷FP¢Âöƒ#à¢Ç6Æ74æÖSÒ&×BÓ"FW‡B×6ÒÆVF–ærÓbFW‡B×6ÆFRÓc#à¢–æf÷&ÖR§W7F–f–6F—f&6æ6VÆ'²"'Ğ¢Ç7â6Æ74æÖSÒ&föçBÖÖöæòföçB×6VÖ–&öÆBFW‡B×6ÆFRÓ“S#à¢·VæF–æu6W76–öä6æ6VÅ6¶vRæ6öF–võ÷&7G&V–÷Ğ¢Â÷7ãà¢à¢Â÷à¢ÆÆ&VÂ6Æ74æÖSÒ&×BÓBw&–BvÓ"FW‡B×6ÒföçBÖÖVF—VÒFW‡B×6ÆFRÓs#à¢§W7F–f–6F—f¢ÇFW‡F&V¢fÇVS×·6W76–öä6æ6VÅ&V6öçĞ¢öä6†ævS×²†WfVçB’Óâ°¢6WE6W76–öä6æ6VÅ&V6öâ†WfVçBçF&vWBçfÇVR“°¢6WE6W76–öä6æ6VÄW'&÷"‚""“°¢×Ğ¢6Æ74æÖSÒ&Ö–âÖ‚Ó#‚&÷VæFVBÖÖB&÷&FW"&÷&FW"×6ÆFRÓ3&r×v†—FR‚Ó2’Ó"FW‡B×6ÒFW‡B×6ÆFRÓ“S÷WFÆ–æRÖæöæRG&ç6—F–öâfö7W3¦&÷&FW"×&÷6RÓcfö7W3§&–ærÓBfö7W3§&–ær×&÷6RÓ ¢Æ6V†öÆFW#Ò$ö'&–vL;7&– ¢&WV—&V@¢óà¢ÂöÆ&VÃà¢·6W76–öä6æ6VÄW'&÷"ò€¢ÄfVVF&6´ÖW76vRFöæSÒ'v&æ–ær#à¢·6W76–öä6æ6VÄW'&÷'Ğ¢ÂôfVVF&6´ÖW76vSà¢’¢çVÆÇĞ¢ÆF—b6Æ74æÖSÒ&×BÓRfÆW‚fÆW‚Ö6öÂ×&WfW'6RvÓ26Ó¦fÆW‚×&÷r6Ó¦§W7F–g’ÖVæB#à¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ°¢6WEVæF–æu6W76–öä6æ6VÅ6¶vR†çVÆÂ“°¢6WE6W76–öä6æ6VÅ&V6öâ‚""“°¢6WE6W76–öä6æ6VÄW'&÷"‚""“°¢fö7W46öFTf–VÆB‚“°¢×Ğ¢6Æ74æÖSÒ&–æÆ–æRÖfÆW‚Ö–âÖ‚Ó—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖÖB&÷&FW"&÷&FW"×6ÆFRÓ3&r×v†—FR‚ÓBFW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×6ÆFRÓsG&ç6—F–öâ†÷fW#¦&÷&FW"×6ÆFRÓC†÷fW#§FW‡B×6ÆFRÓ“Sfö7W3¦÷WFÆ–æRÖæöæRfö7W3§&–ærÓBfö7W3§&–ær×6ÆFRÓ ¢à¢6æ6VÆ ¢Âö'WGFöãà¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×¶6öæf—&Õ6W76–öå6¶vT6æ6VÆÆF–öçĞ¢F—6&ÆVC×·6f–æt6æ6VÆÆF–öçĞ¢6Æ74æÖSÒ&–æÆ–æRÖfÆW‚Ö–âÖ‚Ó—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖÖB&r×&÷6RÓs‚ÓBFW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×v†—FRG&ç6—F–öâ†÷fW#¦&r×&÷6RÓƒfö7W3¦÷WFÆ–æRÖæöæRfö7W3§&–ærÓBfö7W3§&–ær×&÷6RÓF—6&ÆVC¦7W'6÷"Öæ÷BÖÆÆ÷vVBF—6&ÆVC¦÷6—G’Ós ¢à¢6æ6VÆ"6÷FP¢Âö'WGFöãà¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢’¢çVÆÇĞ¢Â÷6V7F–öãà¢“°§Ğ 