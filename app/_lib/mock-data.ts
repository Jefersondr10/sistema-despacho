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

export const stores: Store[] = [
  {
    id: "brasilia",
    name: "Brasília",
    document: "11.222.333/0001-44",
    city: "Brasília, DF",
    status: "Ativa",
  },
  {
    id: "sao-paulo",
    name: "São Paulo",
    document: "55.666.777/0001-88",
    city: "São Paulo, SP",
    status: "Ativa",
  },
];

export const marketplaces: Marketplace[] = [
  {
    id: "amazon",
    name: "Amazon",
    code: "AMZ",
    status: "Ativo",
  },
  {
    id: "shopee",
    name: "Shopee",
    code: "SHP",
    status: "Ativo",
  },
  {
    id: "mercado-livre",
    name: "Mercado Livre",
    code: "MLB",
    status: "Ativo",
  },
  {
    id: "tiktok-shop",
    name: "TikTok Shop",
    code: "TIK",
    status: "Ativo",
  },
  {
    id: "olx",
    name: "OLX",
    code: "OLX",
    status: "Ativo",
  },
];

export const carriers: Carrier[] = [
  {
    id: "correios",
    name: "Correios",
    service: "PAC e Sedex",
    status: "Ativa",
  },
  {
    id: "jadlog",
    name: "Jadlog",
    service: "Expresso",
    status: "Ativa",
  },
  {
    id: "loggi",
    name: "Loggi",
    service: "Coleta urbana",
    status: "Ativa",
  },
  {
    id: "azul-cargo",
    name: "Azul Cargo",
    service: "Aéreo",
    status: "Pendente",
  },
];

export function getTodayDateString() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);

  return local.toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);

  return local.toISOString().slice(0, 10);
}

function atTime(dateString: string, time: string) {
  return `${dateString}T${time}-03:00`;
}

const today = getTodayDateString();
const yesterday = addDays(today, -1);
const twoDaysAgo = addDays(today, -2);

export const dispatchPackages: DispatchPackage[] = [
  {
    id: "pkg-001",
    lote_id: "lote-bsb-amazon-hoje",
    loja_id: "brasilia",
    codigo_rastreio: "BSB-AMZ-845713",
    marketplace: "Amazon",
    melhor_envio: true,
    transportadora: "Correios",
    tipo_operacao: "postagem",
    status: "Bipado",
    data_hora_bipagem: atTime(today, "08:15:00"),
    criado_em: atTime(today, "08:15:05"),
  },
  {
    id: "pkg-002",
    lote_id: "lote-bsb-amazon-hoje",
    loja_id: "brasilia",
    codigo_rastreio: "BSB-AMZ-845714",
    marketplace: "Amazon",
    melhor_envio: true,
    transportadora: "Jadlog",
    tipo_operacao: "postagem",
    status: "Pronto para envio",
    data_hora_bipagem: atTime(today, "08:22:00"),
    criado_em: atTime(today, "08:22:04"),
  },
  {
    id: "pkg-003",
    lote_id: "lote-bsb-shopee-hoje",
    loja_id: "brasilia",
    codigo_rastreio: "BSB-SHP-220198",
    marketplace: "Shopee",
    melhor_envio: false,
    transportadora: null,
    tipo_operacao: "coleta",
    status: "Em separação",
    data_hora_bipagem: atTime(today, "09:05:00"),
    criado_em: atTime(today, "09:05:02"),
  },
  {
    id: "pkg-004",
    lote_id: "lote-bsb-mercado-livre-hoje",
    loja_id: "brasilia",
    codigo_rastreio: "BSB-MLB-991204",
    marketplace: "Mercado Livre",
    melhor_envio: false,
    transportadora: null,
    tipo_operacao: "postagem",
    status: "Bipado",
    data_hora_bipagem: atTime(today, "09:18:00"),
    criado_em: atTime(today, "09:18:07"),
  },
  {
    id: "pkg-005",
    lote_id: "lote-bsb-tiktok-ontem",
    loja_id: "brasilia",
    codigo_rastreio: "BSB-TIK-338871",
    marketplace: "TikTok Shop",
    melhor_envio: true,
    transportadora: "Loggi",
    tipo_operacao: "coleta",
    status: "Finalizado",
    data_hora_bipagem: atTime(yesterday, "16:40:00"),
    criado_em: atTime(yesterday, "16:40:02"),
  },
  {
    id: "pkg-006",
    lote_id: "lote-bsb-shopee-ontem",
    loja_id: "brasilia",
    codigo_rastreio: "BSB-SHP-220199",
    marketplace: "Shopee",
    melhor_envio: true,
    transportadora: "Correios",
    tipo_operacao: "postagem",
    status: "Bipado",
    data_hora_bipagem: atTime(yesterday, "17:12:00"),
    criado_em: atTime(yesterday, "17:12:05"),
  },
  {
    id: "pkg-007",
    lote_id: "lote-sp-amazon-hoje",
    loja_id: "sao-paulo",
    codigo_rastreio: "SP-AMZ-845715",
    marketplace: "Amazon",
    melhor_envio: true,
    transportadora: "Correios",
    tipo_operacao: "postagem",
    status: "Pronto para envio",
    data_hora_bipagem: atTime(today, "10:03:00"),
    criado_em: atTime(today, "10:03:05"),
  },
  {
    id: "pkg-008",
    lote_id: "lote-sp-shopee-hoje",
    loja_id: "sao-paulo",
    codigo_rastreio: "SP-SHP-220200",
    marketplace: "Shopee",
    melhor_envio: false,
    transportadora: null,
    tipo_operacao: "coleta",
    status: "Em separação",
    data_hora_bipagem: atTime(today, "10:17:00"),
    criado_em: atTime(today, "10:17:03"),
  },
  {
    id: "pkg-009",
    lote_id: "lote-sp-mercado-livre-ontem",
    loja_id: "sao-paulo",
    codigo_rastreio: "SP-MLB-991205",
    marketplace: "Mercado Livre",
    melhor_envio: true,
    transportadora: "Azul Cargo",
    tipo_operacao: "postagem",
    status: "Finalizado",
    data_hora_bipagem: atTime(yesterday, "17:39:00"),
    criado_em: atTime(yesterday, "17:39:04"),
  },
  {
    id: "pkg-010",
    lote_id: "lote-sp-amazon-ontem",
    loja_id: "sao-paulo",
    codigo_rastreio: "SP-AMZ-845716",
    marketplace: "Amazon",
    melhor_envio: false,
    transportadora: null,
    tipo_operacao: "coleta",
    status: "Bipado",
    data_hora_bipagem: atTime(yesterday, "18:02:00"),
    criado_em: atTime(yesterday, "18:02:06"),
  },
  {
    id: "pkg-011",
    lote_id: "lote-sp-olx-antigo",
    loja_id: "sao-paulo",
    codigo_rastreio: "SP-OLX-338872",
    marketplace: "OLX",
    melhor_envio: true,
    transportadora: "Jadlog",
    tipo_operacao: "coleta",
    status: "Bipado",
    data_hora_bipagem: atTime(twoDaysAgo, "14:25:00"),
    criado_em: atTime(twoDaysAgo, "14:25:03"),
  },
  {
    id: "pkg-012",
    lote_id: "lote-sp-shopee-antigo",
    loja_id: "sao-paulo",
    codigo_rastreio: "SP-SHP-220201",
    marketplace: "Shopee",
    melhor_envio: false,
    transportadora: null,
    tipo_operacao: "postagem",
    status: "Cancelado",
    data_hora_bipagem: atTime(twoDaysAgo, "15:01:00"),
    criado_em: atTime(twoDaysAgo, "15:01:05"),
  },
];

export const dispatchBatches: DispatchBatch[] = [
  {
    id: "lote-bsb-amazon-hoje",
    loja_id: "brasilia",
    marketplace: "Amazon",
    melhor_envio: true,
    transportadora: "Correios",
    tipo_operacao: "postagem",
    status: "finalizada",
    total_pacotes: 2,
    criado_em: atTime(today, "08:15:00"),
    finalizado_em: atTime(today, "08:25:00"),
  },
  {
    id: "lote-bsb-shopee-hoje",
    loja_id: "brasilia",
    marketplace: "Shopee",
    melhor_envio: false,
    transportadora: null,
    tipo_operacao: "coleta",
    status: "finalizada",
    total_pacotes: 1,
    criado_em: atTime(today, "09:05:00"),
    finalizado_em: atTime(today, "09:08:00"),
  },
  {
    id: "lote-sp-amazon-hoje",
    loja_id: "sao-paulo",
    marketplace: "Amazon",
    melhor_envio: true,
    transportadora: "Correios",
    tipo_operacao: "postagem",
    status: "finalizada",
    total_pacotes: 1,
    criado_em: atTime(today, "10:03:00"),
    finalizado_em: atTime(today, "10:06:00"),
  },
  {
    id: "lote-sp-shopee-hoje",
    loja_id: "sao-paulo",
    marketplace: "Shopee",
    melhor_envio: false,
    transportadora: null,
    tipo_operacao: "coleta",
    status: "finalizada",
    total_pacotes: 1,
    criado_em: atTime(today, "10:17:00"),
    finalizado_em: atTime(today, "10:20:00"),
  },
];

export const dispatchMovements: PackageMovement[] = dispatchPackages.flatMap(
  (item, index) => [
    {
      id: `mov-${index + 1}-a`,
      lote_id: item.lote_id,
      loja_id: item.loja_id,
      pacote_id: item.id,
      codigo_rastreio: item.codigo_rastreio,
      marketplace: item.marketplace,
      melhor_envio: item.melhor_envio,
      transportadora: item.transportadora,
      tipo_operacao: item.tipo_operacao,
      tipo_movimentacao: "Bipagem",
      data_hora: item.data_hora_bipagem,
      criado_em: item.criado_em,
    },
    ...(item.status === "Finalizado" || item.status === "Pronto para envio"
      ? [
          {
            id: `mov-${index + 1}-b`,
            lote_id: item.lote_id,
            loja_id: item.loja_id,
            pacote_id: item.id,
            codigo_rastreio: item.codigo_rastreio,
            marketplace: item.marketplace,
            melhor_envio: item.melhor_envio,
            transportadora: item.transportadora,
            tipo_operacao: item.tipo_operacao,
            tipo_movimentacao: "Expedição" as MovementType,
            data_hora: item.criado_em,
            criado_em: item.criado_em,
          },
        ]
      : []),
  ],
);

export const dispatchCancellations: PackageCancellation[] = [
  {
    id: "can-001",
    pacote_id: "pkg-012",
    loja_id: "sao-paulo",
    loja_nome: "São Paulo",
    sessao_id: "lote-sp-shopee-antigo",
    codigo_pacote: "SP-SHP-220201",
    marketplace: "Shopee",
    tipo_operacao: "postagem",
    melhor_envio: false,
    transportadora: null,
    data_hora_bipagem: atTime(twoDaysAgo, "15:01:00"),
    cancelado_em: atTime(today, "11:35:00"),
    justificativa_geral: "Cancelamento operacional de teste.",
    justificativa_individual: "Pacote removido do despacho mockado.",
    criado_em: atTime(today, "11:35:00"),
  },
];

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

export function getDateRangeFromFilters(filters: PackageFilterValues) {
  if (filters.dateMode === "all") {
    return { startDate: "", endDate: "" };
  }

  if (filters.dateMode === "today") {
    const currentDate = getTodayDateString();

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
) {
  const query = normalizeTrackingCode(filters.query ?? "");
  const codigoLote = normalizeTrackingCode(filters.codigoLote ?? "");
  const { startDate, endDate } = getDateRangeFromFilters(filters);

  return packages.filter((item) => {
    const packageDate = item.data_hora_bipagem.slice(0, 10);
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
) {
  const query = normalizeTrackingCode(filters.query ?? "");
  const { startDate, endDate } = getDateRangeFromFilters(filters);

  return cancellations.filter((item) => {
    const canceledDate = item.cancelado_em.slice(0, 10);
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
        normalizeTrackingCode(cancellation.codigo_pacote) === normalizedCode,
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
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function formatPackageDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
}
