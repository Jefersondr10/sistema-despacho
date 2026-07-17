export type Store = {
  id: string;
  name: string;
  document: string;
  city: string;
  status: "Ativa" | "Inativa";
};

export type Marketplace = {
  id: string;
  name: string;
  code: string;
  status: "Ativo" | "Em homologação" | "Inativo";
};

export type Carrier = {
  id: string;
  name: string;
  service: string;
  status: "Ativa" | "Pendente" | "Inativa";
};

export type OperationType = "coleta" | "postagem";

export type PackageStatus =
  | "Pendente na sessão"
  | "Bipado"
  | "Em separação"
  | "Pronto para envio"
  | "Finalizado"
  | "Cancelado";

export type MovementType =
  | "Bipagem"
  | "Cancelamento"
  | "Conferência"
  | "Separação"
  | "Expedição";

export type DispatchPackage = {
  id: string;
  lote_id: string;
  codigo_lote?: string | null;
  loja_id: Store["id"];
  codigo_rastreio: string;
  marketplace: string;
  melhor_envio: boolean;
  transportadora: string | null;
  tipo_operacao: OperationType;
  status: PackageStatus;
  data_hora_bipagem: string;
  criado_em: string;
};

export type PackageCancellation = {
  id: string;
  pacote_id: string;
  loja_id: Store["id"];
  loja_nome: string;
  sessao_id: string;
  codigo_lote?: string | null;
  codigo_pacote: string;
  marketplace: string;
  tipo_operacao: OperationType;
  melhor_envio: boolean;
  transportadora: string | null;
  data_hora_bipagem: string;
  cancelado_em: string;
  justificativa_geral: string;
  justificativa_individual: string;
  criado_em: string;
};

export type PackageMovement = {
  id: string;
  lote_id: string;
  loja_id: Store["id"];
  pacote_id: string;
  codigo_rastreio: string;
  marketplace: string;
  melhor_envio: boolean;
  transportadora: string | null;
  tipo_operacao: OperationType;
  tipo_movimentacao: MovementType;
  data_hora: string;
  criado_em: string;
};

export type DispatchBatch = {
  id: string;
  codigo_lote?: string | null;
  loja_id: Store["id"];
  marketplace: string;
  melhor_envio: boolean;
  transportadora: string | null;
  tipo_operacao: OperationType;
  status: "aberta" | "finalizada" | "cancelada";
  total_pacotes: number;
  criado_em: string;
  finalizado_em: string | null;
};

export type ScanBatch = DispatchBatch;

export type DateFilterMode = "today" | "single" | "range" | "all";
export type MelhorEnvioFilter = "todos" | "sim" | "nao";
export type OperationFilter = "todos" | OperationType;

export type PackageFilterValues = {
  dateMode: DateFilterMode;
  selectedDate: string;
  startDate: string;
  endDate: string;
  marketplace: string[];
  melhorEnvio: MelhorEnvioFilter;
  transportadora: string[];
  lojaId: string[];
  tipoOperacao: OperationFilter;
  query?: string;
  codigoLote?: string;
};

export type ReportSummaryItem = {
  id: string;
  label: string;
  marketplace: string;
  tipo_operacao: OperationType;
  melhor_envio: boolean;
  transportadora: string | null;
  packages: number;
  lojas: Array<{
    loja_id: string;
    loja_nome: string;
    packages: number;
  }>;
};

export const stores: Store[] = [];

export const marketplaces: Marketplace[] = [];

export const carriers: Carrier[] = [];

export const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

const saoPauloDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SAO_PAULO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getSaoPauloDateString(isoDate: string) {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Data ISO invalida.");
  }

  const parts = saoPauloDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Nao foi possivel calcular a data em Sao Paulo.");
  }

  return `${year}-${month}-${day}`;
}

export function getTodayDateString(referenceIso = new Date().toISOString()) {
  return getSaoPauloDateString(referenceIso);
}

export const dispatchPackages: DispatchPackage[] = [];

export const dispatchBatches: DispatchBatch[] = [];

export const dispatchMovements: PackageMovement[] = [];

export const dispatchCancellations: PackageCancellation[] = [];
export function createDefaultPackageFilters(): PackageFilterValues {
  const currentDate = getTodayDateString();

  return {
    dateMode: "today",
    selectedDate: currentDate,
    startDate: currentDate,
    endDate: currentDate,
    marketplace: [],
    melhorEnvio: "todos",
    transportadora: [],
    lojaId: [],
    tipoOperacao: "todos",
    query: "",
    codigoLote: "",
  };
}

export function getStoreName(lojaId: string, catalogStores: Store[] = []) {
  return catalogStores.find((store) => store.id === lojaId)?.name ?? lojaId;
}

export function normalizeTrackingCode(code: string) {
  return code.replace(/\s+/g, "").toUpperCase();
}

export function getOperationLabel(operation: OperationType | OperationFilter) {
  if (operation === "todos") {
    return "Todos";
  }

  return operation === "coleta" ? "Coleta" : "Postagem";
}

export function getDateRangeFromFilters(
  filters: PackageFilterValues,
  referenceIso?: string,
) {
  if (filters.dateMode === "all") {
    return { startDate: "", endDate: "" };
  }

  if (filters.dateMode === "today") {
    const currentDate = getTodayDateString(referenceIso);

    return { startDate: currentDate, endDate: currentDate };
  }

  if (filters.dateMode === "single") {
    return {
      startDate: filters.selectedDate,
      endDate: filters.selectedDate,
    };
  }

  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
  };
}

export function describeDateFilter(filters: PackageFilterValues) {
  const { startDate, endDate } = getDateRangeFromFilters(filters);

  if (filters.dateMode === "today") {
    return `Hoje (${formatDateOnly(startDate)})`;
  }

  if (filters.dateMode === "all") {
    return "Todos os períodos";
  }

  if (filters.dateMode === "single") {
    return formatDateOnly(startDate);
  }

  return `${formatDateOnly(startDate)} até ${formatDateOnly(endDate)}`;
}

export function getReportSummary(
  packages: DispatchPackage[],
  catalogStores: Store[] = [],
): ReportSummaryItem[] {
  const grouped = new Map<string, ReportSummaryItem>();

  for (const item of packages) {
    const transportadoraKey = item.melhor_envio
      ? item.transportadora ?? "sem-transportadora"
      : "sem-transportadora";
    const id = [
      item.marketplace,
      item.tipo_operacao,
      item.melhor_envio ? "melhor-envio" : "sem-melhor-envio",
      transportadoraKey,
    ].join("-");
    const current = grouped.get(id);
    const lojaNome = getStoreName(item.loja_id, catalogStores);

    if (current) {
      current.packages += 1;
      const loja = current.lojas.find((store) => store.loja_id === item.loja_id);
      if (loja) {
        loja.packages += 1;
      } else {
        current.lojas.push({
          loja_id: item.loja_id,
          loja_nome: lojaNome,
          packages: 1,
        });
      }
      continue;
    }

    grouped.set(id, {
      id,
      label: [
        item.marketplace,
        getOperationLabel(item.tipo_operacao),
        item.melhor_envio ? "Melhor Envio" : "Sem Melhor Envio",
        item.melhor_envio ? item.transportadora : null,
      ]
        .filter(Boolean)
        .join(" · "),
      marketplace: item.marketplace,
      tipo_operacao: item.tipo_operacao,
      melhor_envio: item.melhor_envio,
      transportadora: item.melhor_envio ? item.transportadora : null,
      packages: 1,
      lojas: [
        {
          loja_id: item.loja_id,
          loja_nome: lojaNome,
          packages: 1,
        },
      ],
    });
  }

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      lojas: [...item.lojas].sort(
        (a, b) =>
          b.packages - a.packages ||
          a.loja_nome.localeCompare(b.loja_nome, "pt-BR"),
      ),
    }))
    .sort((a, b) =>
      `${a.marketplace}-${a.tipo_operacao}-${a.melhor_envio}-${a.transportadora ?? ""}`.localeCompare(
        `${b.marketplace}-${b.tipo_operacao}-${b.melhor_envio}-${b.transportadora ?? ""}`,
        "pt-BR",
      ),
    );
}

export function getDashboardMetrics(packages: DispatchPackage[]) {
  const total = packages.length;
  const melhorEnvio = packages.filter((item) => item.melhor_envio).length;
  const semTransportadora = packages.filter(
    (item) => item.transportadora === null,
  ).length;
  const pending = packages.filter(
    (item) => item.status !== "Finalizado" && item.status !== "Cancelado",
  ).length;
  const coletas = packages.filter((item) => item.tipo_operacao === "coleta").length;
  const postagens = packages.filter(
    (item) => item.tipo_operacao === "postagem",
  ).length;

  return {
    total,
    melhorEnvio,
    semTransportadora,
    pending,
    coletas,
    postagens,
  };
}

export function filterPackages(
  packages: DispatchPackage[],
  filters: PackageFilterValues,
  referenceIso?: string,
) {
  const query = normalizeTrackingCode(filters.query ?? "");
  const codigoLote = normalizeTrackingCode(filters.codigoLote ?? "");
  const { startDate, endDate } = getDateRangeFromFilters(filters, referenceIso);

  return packages.filter((item) => {
    const packageDate = getSaoPauloDateString(item.data_hora_bipagem);
    const matchesDate =
      filters.dateMode === "all" ||
      (packageDate >= startDate && packageDate <= endDate);
    const matchesMarketplace =
      filters.marketplace.length === 0 ||
      filters.marketplace.includes(item.marketplace);
    const matchesMelhorEnvio =
      filters.melhorEnvio === "todos" ||
      (filters.melhorEnvio === "sim" && item.melhor_envio) ||
      (filters.melhorEnvio === "nao" && !item.melhor_envio);
    const matchesCarrier =
      filters.transportadora.length === 0 ||
      (filters.transportadora.includes("sem-transportadora") &&
        item.transportadora === null) ||
      (item.transportadora !== null &&
        filters.transportadora.includes(item.transportadora));
    const matchesStore =
      filters.lojaId.length === 0 || filters.lojaId.includes(item.loja_id);
    const matchesOperation =
      filters.tipoOperacao === "todos" ||
      item.tipo_operacao === filters.tipoOperacao;
    const matchesQuery =
      !query || normalizeTrackingCode(item.codigo_rastreio).includes(query);
    const matchesBatchCode =
      !codigoLote ||
      normalizeTrackingCode(item.codigo_lote ?? item.lote_id).includes(
        codigoLote,
      );

    return (
      matchesDate &&
      matchesMarketplace &&
      matchesMelhorEnvio &&
      matchesCarrier &&
      matchesStore &&
      matchesOperation &&
      matchesQuery &&
      matchesBatchCode
    );
  });
}

export function filterCancellations(
  cancellations: PackageCancellation[],
  filters: PackageFilterValues,
  referenceIso?: string,
) {
  const query = normalizeTrackingCode(filters.query ?? "");
  const { startDate, endDate } = getDateRangeFromFilters(filters, referenceIso);

  return cancellations.filter((item) => {
    const canceledDate = getSaoPauloDateString(item.cancelado_em);
    const matchesDate =
      filters.dateMode === "all" ||
      (canceledDate >= startDate && canceledDate <= endDate);
    const matchesMarketplace =
      filters.marketplace.length === 0 ||
      filters.marketplace.includes(item.marketplace);
    const matchesMelhorEnvio =
      filters.melhorEnvio === "todos" ||
      (filters.melhorEnvio === "sim" && item.melhor_envio) ||
      (filters.melhorEnvio === "nao" && !item.melhor_envio);
    const matchesCarrier =
      filters.transportadora.length === 0 ||
      (filters.transportadora.includes("sem-transportadora") &&
        item.transportadora === null) ||
      (item.transportadora !== null &&
        filters.transportadora.includes(item.transportadora));
    const matchesStore =
      filters.lojaId.length === 0 || filters.lojaId.includes(item.loja_id);
    const matchesOperation =
      filters.tipoOperacao === "todos" ||
      item.tipo_operacao === filters.tipoOperacao;
    const matchesQuery =
      !query || normalizeTrackingCode(item.codigo_pacote).includes(query);

    return (
      matchesDate &&
      matchesMarketplace &&
      matchesMelhorEnvio &&
      matchesCarrier &&
      matchesStore &&
      matchesOperation &&
      matchesQuery
    );
  });
}

export function isPackageCanceled(
  item: DispatchPackage,
  cancellations: PackageCancellation[],
) {
  const normalizedCode = normalizeTrackingCode(item.codigo_rastreio);

  return (
    item.status === "Cancelado" ||
    cancellations.some(
      (cancellation) =>
        cancellation.pacote_id === item.id ||
        (cancellation.loja_id === item.loja_id &&
          normalizeTrackingCode(cancellation.codigo_pacote) === normalizedCode),
    )
  );
}

export function getActivePackages(
  packages: DispatchPackage[],
  cancellations: PackageCancellation[],
) {
  return packages.filter((item) => !isPackageCanceled(item, cancellations));
}

export function formatDateOnly(date: string) {
  const [year, month, day] = date.split("-");

  if (!year || !month || !day) {
    return date;
  }

  return `${day}/${month}/${year}`;
}

export function formatPackageDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
}
