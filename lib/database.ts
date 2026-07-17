import type {
  SupabaseClient,
} from "@supabase/supabase-js";
import type {
  Carrier,
  DispatchBatch,
  DispatchPackage,
  Marketplace,
  MovementType,
  PackageCancellation,
  PackageMovement,
  PackageStatus,
  Store,
} from "@/app/_lib/mock-data";
import { getSupabaseClient } from "@/lib/supabaseClient";

export type DatabaseContext = {
  supabase?: SupabaseClient;
};

type ResolvedDatabaseContext = {
  supabase: SupabaseClient;
};

export type TipoOperacao = "coleta" | "postagem";
export type SessaoBipagemStatus = "aberta" | "finalizada" | "cancelada";
export type PacoteDatabaseStatus =
  | "pendente_sessao"
  | "bipado"
  | "em_separacao"
  | "pronto_para_envio"
  | "finalizado"
  | "cancelado";

export type LojaRow = {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  created_at: string;
  updated_at: string | null;
};

export type MarketplaceRow = {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  created_at: string;
  updated_at: string | null;
};

export type TransportadoraRow = {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  created_at: string;
  updated_at: string | null;
};

export type RelatorioDestinatarioRow = {
  id: string;
  nome: string | null;
  email: string;
  ativo: boolean;
  created_at: string;
  updated_at: string | null;
};

export type RelatorioEnvioStatus = "sucesso" | "erro";

export type RelatorioEnvioRow = {
  id: string;
  destinatarios: string[];
  assunto: string;
  filtros: Record<string, unknown>;
  status: RelatorioEnvioStatus;
  erro: string | null;
  enviado_em: string;
};

export type SessaoBipagemRow = {
  id: string;
  codigo_lote: string | null;
  loja_id: string;
  marketplace_id: string;
  tipo_operacao: TipoOperacao;
  melhor_envio: boolean;
  transportadora_id: string | null;
  status: SessaoBipagemStatus | string;
  iniciada_em: string;
  finalizada_em: string | null;
  cancelada_em?: string | null;
};

export type ItemSessaoBipagemStatus =
  | "pendente"
  | "finalizado"
  | "descartado"
  | "cancelado";

export type ItemSessaoBipagemRow = {
  id: string;
  sessao_id: string;
  codigo: string;
  codigo_normalizado: string;
  ordem: number;
  status: ItemSessaoBipagemStatus | string;
  duplicado: boolean;
  criado_em: string;
  atualizado_em: string | null;
};

export type PacoteRow = {
  id: string;
  codigo: string;
  loja_id: string;
  marketplace_id: string;
  transportadora_id: string | null;
  sessao_id: string | null;
  tipo_operacao: TipoOperacao;
  melhor_envio: boolean;
  status: PacoteDatabaseStatus | string;
  bipado_em: string;
  finalizado_em: string | null;
  cancelado_em: string | null;
};

export type MovimentacaoRow = {
  id: string;
  pacote_id: string | null;
  loja_id: string;
  sessao_id: string | null;
  tipo_movimentacao: string;
  descricao: string | null;
  criada_em: string;
};

export type PacoteCanceladoRow = {
  id: string;
  pacote_id: string | null;
  codigo_pacote: string;
  loja_id: string;
  marketplace_id: string | null;
  transportadora_id: string | null;
  sessao_id: string | null;
  tipo_operacao: TipoOperacao | null;
  melhor_envio: boolean | null;
  justificativa_geral: string | null;
  justificativa_individual: string | null;
  bipado_em: string | null;
  cancelado_em: string;
};

export type PacoteComRelacionamentosRow = PacoteRow & {
  loja: LojaRow | null;
  marketplace: MarketplaceRow | null;
  transportadora: TransportadoraRow | null;
  sessao: SessaoBipagemRow | null;
};

export type SessaoComRelacionamentosRow = SessaoBipagemRow & {
  loja: LojaRow | null;
  marketplace: MarketplaceRow | null;
  transportadora: TransportadoraRow | null;
  total_pacotes?: number;
};

export type SessaoBipagemAbertaComItens = {
  sessao: SessaoComRelacionamentosRow;
  itens: ItemSessaoBipagemRow[];
};

export type PacoteCanceladoComRelacionamentosRow = PacoteCanceladoRow & {
  loja: LojaRow | null;
  marketplace: MarketplaceRow | null;
  transportadora: TransportadoraRow | null;
  sessao: SessaoBipagemRow | null;
  pacote: PacoteRow | null;
};

type ListOptions = {
  incluirInativos?: boolean;
  limit?: number;
};

export type PacoteFilters = {
  codigo?: string;
  incluirCancelados?: boolean;
  loja_id?: string;
  marketplace_id?: string;
  sessao_id?: string;
  status?: PacoteDatabaseStatus | string;
  limit?: number;
};

export type SessaoBipagemFilters = {
  loja_id?: string;
  marketplace_id?: string;
  transportadora_id?: string | null;
  status?: SessaoBipagemStatus | string;
  limit?: number;
  incluirCanceladosNoTotal?: boolean;
  incluirCanceladas?: boolean;
};

export type PacoteCanceladoFilters = {
  codigo?: string;
  loja_id?: string;
  marketplace_id?: string;
  sessao_id?: string | null;
  transportadora_id?: string | null;
  limit?: number;
};

export type MovimentacaoFilters = {
  loja_id?: string;
  pacote_id?: string;
  sessao_id?: string;
  limit?: number;
};

export type CreateCatalogInput = {
  nome: string;
  slug?: string;
};

type CatalogInput = CreateCatalogInput | string;

export type CreateRelatorioEnvioHistoricoInput = {
  destinatarios: string[];
  assunto: string;
  filtros?: Record<string, unknown>;
  status: RelatorioEnvioStatus;
  erro?: string | null;
  enviado_em?: string;
};

export type CreateSessaoInput = {
  loja_id: string;
  marketplace_id: string;
  tipo_operacao: TipoOperacao;
  melhor_envio?: boolean;
  transportadora_id?: string | null;
  status?: SessaoBipagemStatus;
  iniciada_em?: string;
};

export type CreateItemSessaoBipagemInput = {
  sessao_id: string;
  codigo: string;
};

export type FinalizarSessaoBipagemResult = {
  sessao_id: string;
  codigo_lote?: string | null;
  total_pacotes: number;
  finalizada_em: string;
};

export type FinalizarCancelamentoLoteInput = {
  pacote_id: string;
  justificativa_geral: string;
  justificativa_individual?: string | null;
};

export type CreatePacoteInput = {
  codigo: string;
  loja_id: string;
  marketplace_id: string;
  transportadora_id?: string | null;
  sessao_id?: string | null;
  tipo_operacao: TipoOperacao;
  melhor_envio?: boolean;
  status?: PacoteDatabaseStatus;
  bipado_em?: string;
};

export type CreateMovimentacaoInput = {
  pacote_id?: string | null;
  loja_id: string;
  sessao_id?: string | null;
  tipo_movimentacao: string;
  descricao?: string | null;
  criada_em?: string;
};

export type CreateCancelamentoInput = {
  pacote_id?: string | null;
  codigo_pacote: string;
  loja_id: string;
  marketplace_id?: string | null;
  transportadora_id?: string | null;
  sessao_id?: string | null;
  tipo_operacao?: TipoOperacao | null;
  melhor_envio?: boolean | null;
  justificativa_geral?: string | null;
  justificativa_individual?: string | null;
  bipado_em?: string | null;
  cancelado_em?: string;
};

export type CancelarPacoteInput = CreateCancelamentoInput & {
  pacote_id: string;
  tipo_movimentacao?: string;
  descricao_movimentacao?: string | null;
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function nowIso() {
  return new Date().toISOString();
}

async function getDatabaseContext(
  context?: DatabaseContext,
): Promise<ResolvedDatabaseContext> {
  const supabase = context?.supabase ?? getSupabaseClient();

  return { supabase };
}

function getCatalogInput(input: CatalogInput): CreateCatalogInput {
  return typeof input === "string" ? { nome: input } : input;
}

function getCatalogPayload(input: CatalogInput) {
  const normalized = getCatalogInput(input);
  const nome = normalized.nome.trim();

  return {
    nome,
    slug: normalized.slug?.trim() || slugify(nome),
    ativo: true,
  };
}

function requireText(value: string | null | undefined, fieldName: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${fieldName} obrigatorio.`);
  }

  return normalized;
}

function optionalText(value: string | null | undefined) {
  const normalized = value?.trim();

  return normalized || null;
}

function normalizeEmail(value: string) {
  return String(value ?? "").trim().toLowerCase();
}

export function validateEmailAddress(value: string, fieldName = "E-mail") {
  const normalized = normalizeEmail(value);

  if (!normalized) {
    throw new Error(`${fieldName} obrigatorio.`);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error(`${fieldName} invalido.`);
  }

  return normalized;
}

function validateTipoOperacao(value: unknown): TipoOperacao {
  if (value === "coleta" || value === "postagem") {
    return value;
  }

  throw new Error("tipo_operacao deve ser coleta ou postagem.");
}

function getSessaoPayload(input: CreateSessaoInput) {
  const melhorEnvio = input.melhor_envio ?? false;
  const transportadoraId = optionalText(input.transportadora_id);

  if (melhorEnvio && !transportadoraId) {
    throw new Error("transportadora_id obrigatorio para Melhor Envio.");
  }

  return {
    loja_id: requireText(input.loja_id, "loja_id"),
    marketplace_id: requireText(input.marketplace_id, "marketplace_id"),
    tipo_operacao: validateTipoOperacao(input.tipo_operacao),
    melhor_envio: melhorEnvio,
    transportadora_id: transportadoraId,
    status: input.status ?? "aberta",
    iniciada_em: input.iniciada_em ?? nowIso(),
  };
}

export function formatDatabaseError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    if (
      "code" in error &&
      String((error as { code?: unknown }).code) === "23505"
    ) {
      return "Este cadastro ja existe no Supabase.";
    }

    const message = String((error as { message?: unknown }).message || "");
    if (message) return message;
  }

  return "Nao foi possivel concluir a operacao no Supabase.";
}

export function mapLojaRowToStore(row: LojaRow): Store {
  return {
    id: row.id,
    name: row.nome,
    document: row.slug,
    city: "",
    status: row.ativo ? "Ativa" : "Inativa",
  };
}

export function mapMarketplaceRowToMarketplace(row: MarketplaceRow): Marketplace {
  return {
    id: row.id,
    name: row.nome,
    code: row.slug.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase(),
    status: row.ativo ? "Ativo" : "Inativo",
  };
}

export function mapTransportadoraRowToCarrier(row: TransportadoraRow): Carrier {
  return {
    id: row.id,
    name: row.nome,
    service: row.slug,
    status: row.ativo ? "Ativa" : "Inativa",
  };
}

export function normalizeDatabaseTrackingCode(code: string) {
  return String(code ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

export const normalizeCodigoPacote = normalizeDatabaseTrackingCode;

function getPacotePayload(
  input: CreatePacoteInput,
  bipadoEm = nowIso(),
  options: { requireSessaoId?: boolean } = {},
) {
  const codigo = normalizeDatabaseTrackingCode(input.codigo);
  const melhorEnvio = input.melhor_envio ?? false;
  const transportadoraId = optionalText(input.transportadora_id);
  const sessaoId = optionalText(input.sessao_id);

  if (!codigo) {
    throw new Error("codigo obrigatorio.");
  }

  if (melhorEnvio && !transportadoraId) {
    throw new Error("transportadora_id obrigatorio para Melhor Envio.");
  }

  if (options.requireSessaoId && !sessaoId) {
    throw new Error("sessao_id obrigatorio para pacote de sessao.");
  }

  return {
    codigo,
    loja_id: requireText(input.loja_id, "loja_id"),
    marketplace_id: requireText(input.marketplace_id, "marketplace_id"),
    transportadora_id: transportadoraId,
    sessao_id: sessaoId,
    tipo_operacao: validateTipoOperacao(input.tipo_operacao),
    melhor_envio: melhorEnvio,
    status: input.status ?? "bipado",
    bipado_em: input.bipado_em ?? bipadoEm,
  };
}

function getMovimentacaoPayload(
  input: CreateMovimentacaoInput,
  criadaEm = nowIso(),
) {
  return {
    pacote_id: input.pacote_id ?? null,
    loja_id: input.loja_id,
    sessao_id: input.sessao_id ?? null,
    tipo_movimentacao: input.tipo_movimentacao,
    descricao: input.descricao ?? null,
    criada_em: input.criada_em ?? criadaEm,
  };
}

function getCancelamentoPayload(
  input: CreateCancelamentoInput,
  canceladoEm = nowIso(),
) {
  const codigoPacote = normalizeDatabaseTrackingCode(input.codigo_pacote);
  const justificativaGeral = input.justificativa_geral?.trim();

  if (!codigoPacote) {
    throw new Error("codigo_pacote obrigatorio.");
  }

  if (!justificativaGeral) {
    throw new Error("justificativa_geral obrigatoria para cancelamento.");
  }

  return {
    pacote_id: input.pacote_id ?? null,
    codigo_pacote: codigoPacote,
    loja_id: requireText(input.loja_id, "loja_id"),
    marketplace_id: optionalText(input.marketplace_id),
    transportadora_id: optionalText(input.transportadora_id),
    sessao_id: optionalText(input.sessao_id),
    tipo_operacao: input.tipo_operacao ?? null,
    melhor_envio: input.melhor_envio ?? null,
    justificativa_geral: justificativaGeral,
    justificativa_individual: input.justificativa_individual?.trim() ?? null,
    bipado_em: input.bipado_em ?? null,
    cancelado_em: input.cancelado_em ?? canceladoEm,
  };
}

function getCancelarPacotePayload(input: CancelarPacoteInput) {
  const codigoPacote = normalizeDatabaseTrackingCode(input.codigo_pacote);
  const justificativaGeral = input.justificativa_geral?.trim();

  if (!codigoPacote) {
    throw new Error("codigo_pacote obrigatorio.");
  }

  if (!justificativaGeral) {
    throw new Error("justificativa_geral obrigatoria para cancelamento.");
  }

  return {
    pacote_id: requireText(input.pacote_id, "pacote_id"),
    codigo_pacote: codigoPacote,
    loja_id: requireText(input.loja_id, "loja_id"),
    marketplace_id: optionalText(input.marketplace_id),
    transportadora_id: optionalText(input.transportadora_id),
    sessao_id: optionalText(input.sessao_id),
    tipo_operacao: input.tipo_operacao ?? null,
    melhor_envio: input.melhor_envio ?? null,
    justificativa_geral: justificativaGeral,
    justificativa_individual: input.justificativa_individual?.trim() ?? null,
    bipado_em: input.bipado_em ?? null,
    cancelado_em: input.cancelado_em ?? nowIso(),
    tipo_movimentacao: input.tipo_movimentacao ?? "Cancelamento",
    descricao_movimentacao: input.descricao_movimentacao ?? null,
  };
}

export function mapDatabasePackageStatusToFrontend(
  status: string,
): PackageStatus {
  const normalized = status.trim().toLowerCase();

  if (normalized === "pendente_sessao" || normalized === "pendente na sessão") {
    return "Pendente na sessão";
  }

  if (normalized === "em_separacao" || normalized === "em separação") {
    return "Em separação";
  }

  if (normalized === "pronto_para_envio" || normalized === "pronto para envio") {
    return "Pronto para envio";
  }

  if (normalized === "finalizado") {
    return "Finalizado";
  }

  if (normalized === "cancelado") {
    return "Cancelado";
  }

  return "Bipado";
}

export function mapFrontendPackageStatusToDatabase(
  status: PackageStatus | string,
): PacoteDatabaseStatus {
  const normalized = status
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("cancel")) return "cancelado";
  if (normalized.includes("finaliz")) return "finalizado";
  if (normalized.includes("pronto")) return "pronto_para_envio";
  if (normalized.includes("separa")) return "em_separacao";
  if (normalized.includes("pendente")) return "pendente_sessao";

  return "bipado";
}

function mapMovementType(type: string): MovementType {
  const normalized = type.trim().toLowerCase();

  if (normalized === "cancelamento") return "Cancelamento";
  if (normalized === "conferência" || normalized === "conferencia") {
    return "Conferência";
  }
  if (normalized === "separação" || normalized === "separacao") {
    return "Separação";
  }
  if (normalized === "expedição" || normalized === "expedicao") {
    return "Expedição";
  }

  return "Bipagem";
}

export function mapPacoteRowToDispatchPackage(
  row: PacoteComRelacionamentosRow,
): DispatchPackage {
  return {
    id: row.id,
    lote_id: row.sessao_id ?? "",
    codigo_lote: row.sessao?.codigo_lote ?? null,
    loja_id: row.loja_id,
    codigo_rastreio: row.codigo,
    marketplace: row.marketplace?.nome ?? row.marketplace_id,
    melhor_envio: row.melhor_envio,
    transportadora: row.transportadora?.nome ?? null,
    tipo_operacao: row.tipo_operacao,
    status: mapDatabasePackageStatusToFrontend(row.status),
    data_hora_bipagem: row.bipado_em,
    criado_em: row.bipado_em,
  };
}

export function mapSessaoRowToDispatchBatch(
  row: SessaoComRelacionamentosRow,
  packages: DispatchPackage[] = [],
): DispatchBatch {
  const sessionPackages = packages.filter((item) => item.lote_id === row.id);
  const totalPacotes = row.total_pacotes ?? sessionPackages.length;

  return {
    id: row.id,
    codigo_lote: row.codigo_lote,
    loja_id: row.loja_id,
    marketplace: row.marketplace?.nome ?? row.marketplace_id,
    melhor_envio: row.melhor_envio,
    transportadora: row.transportadora?.nome ?? null,
    tipo_operacao: row.tipo_operacao,
    status:
      row.status === "finalizada"
        ? "finalizada"
        : row.status === "cancelada"
          ? "cancelada"
          : "aberta",
    total_pacotes: totalPacotes,
    criado_em: row.iniciada_em,
    finalizado_em: row.finalizada_em,
  };
}

export function mapItemSessaoRowToDispatchPackage(
  row: ItemSessaoBipagemRow,
  sessao: SessaoComRelacionamentosRow,
): DispatchPackage {
  return {
    id: row.id,
    lote_id: row.sessao_id,
    codigo_lote: sessao.codigo_lote,
    loja_id: sessao.loja_id,
    codigo_rastreio: row.codigo_normalizado,
    marketplace: sessao.marketplace?.nome ?? sessao.marketplace_id,
    melhor_envio: sessao.melhor_envio,
    transportadora: sessao.transportadora?.nome ?? null,
    tipo_operacao: sessao.tipo_operacao,
    status: "Pendente na sessão",
    data_hora_bipagem: row.criado_em,
    criado_em: row.criado_em,
  };
}

export function mapCancelamentoRowToPackageCancellation(
  row: PacoteCanceladoComRelacionamentosRow,
): PackageCancellation {
  return {
    id: row.id,
    pacote_id: row.pacote_id ?? "",
    loja_id: row.loja_id,
    loja_nome: row.loja?.nome ?? row.loja_id,
    sessao_id: row.sessao_id ?? "",
    codigo_lote: row.sessao?.codigo_lote ?? null,
    codigo_pacote: row.codigo_pacote,
    marketplace: row.marketplace?.nome ?? row.marketplace_id ?? "",
    tipo_operacao: row.tipo_operacao ?? "postagem",
    melhor_envio: row.melhor_envio ?? false,
    transportadora: row.transportadora?.nome ?? null,
    data_hora_bipagem: row.bipado_em ?? row.cancelado_em,
    cancelado_em: row.cancelado_em,
    justificativa_geral: row.justificativa_geral ?? "",
    justificativa_individual: row.justificativa_individual ?? "",
    criado_em: row.cancelado_em,
  };
}

export function mapMovimentacaoRowToPackageMovement(
  row: MovimentacaoRow,
): PackageMovement {
  return {
    id: row.id,
    lote_id: row.sessao_id ?? "",
    loja_id: row.loja_id,
    pacote_id: row.pacote_id ?? "",
    codigo_rastreio: "",
    marketplace: "",
    melhor_envio: false,
    transportadora: null,
    tipo_operacao: "postagem",
    tipo_movimentacao: mapMovementType(row.tipo_movimentacao),
    data_hora: row.criada_em,
    criado_em: row.criada_em,
  };
}

export async function getLojas(
  options?: ListOptions,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  let query = supabase
    .from("lojas")
    .select("*")
    .order("nome");

  if (!options?.incluirInativos) {
    query = query.eq("ativo", true);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query.returns<LojaRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function createLoja(
  input: CatalogInput,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const payload = getCatalogPayload(input);
  if (!payload.nome) {
    throw new Error("Informe um nome valido.");
  }

  const { data, error } = await supabase
    .from("lojas")
    .insert(payload)
    .select("*")
    .single<LojaRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateLoja(
  id: string,
  values: Partial<CreateCatalogInput>,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const payload = {
    ...(values.nome ? { nome: values.nome.trim() } : {}),
    ...(values.slug ? { slug: values.slug } : {}),
  };
  const { data, error } = await supabase
    .from("lojas")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single<LojaRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function ativarLoja(id: string, context?: DatabaseContext) {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase
    .from("lojas")
    .update({ ativo: true })
    .eq("id", id)
    .select("*")
    .single<LojaRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function inativarLoja(id: string, context?: DatabaseContext) {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase
    .from("lojas")
    .update({ ativo: false })
    .eq("id", id)
    .select("*")
    .single<LojaRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function excluirLojaDefinitivamente(
  id: string,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const { error } = await supabase
    .from("lojas")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}

export async function excluirLoja(id: string, context?: DatabaseContext) {
  return excluirLojaDefinitivamente(id, context);
}

export async function getMarketplaces(
  options?: ListOptions,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  let query = supabase
    .from("marketplaces")
    .select("*")
    .order("nome");

  if (!options?.incluirInativos) {
    query = query.eq("ativo", true);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query.returns<MarketplaceRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function createMarketplace(
  input: CatalogInput,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const payload = getCatalogPayload(input);
  if (!payload.nome) {
    throw new Error("Informe um nome valido.");
  }

  const { data, error } = await supabase
    .from("marketplaces")
    .insert(payload)
    .select("*")
    .single<MarketplaceRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateMarketplace(
  id: string,
  values: Partial<CreateCatalogInput>,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase
    .from("marketplaces")
    .update({
      ...(values.nome ? { nome: values.nome.trim() } : {}),
      ...(values.slug ? { slug: values.slug } : {}),
    })
    .eq("id", id)
    .select("*")
    .single<MarketplaceRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function ativarMarketplace(id: string, context?: DatabaseContext) {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase
    .from("marketplaces")
    .update({ ativo: true })
    .eq("id", id)
    .select("*")
    .single<MarketplaceRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function inativarMarketplace(
  id: string,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase
    .from("marketplaces")
    .update({ ativo: false })
    .eq("id", id)
    .select("*")
    .single<MarketplaceRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function excluirMarketplaceDefinitivamente(
  id: string,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const { error } = await supabase
    .from("marketplaces")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}

export async function excluirMarketplace(id: string, context?: DatabaseContext) {
  return excluirMarketplaceDefinitivamente(id, context);
}

export async function getTransportadoras(
  options?: ListOptions,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  let query = supabase
    .from("transportadoras")
    .select("*")
    .order("nome");

  if (!options?.incluirInativos) {
    query = query.eq("ativo", true);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query.returns<TransportadoraRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function createTransportadora(
  input: CatalogInput,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const payload = getCatalogPayload(input);
  if (!payload.nome) {
    throw new Error("Informe um nome valido.");
  }

  const { data, error } = await supabase
    .from("transportadoras")
    .insert(payload)
    .select("*")
    .single<TransportadoraRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateTransportadora(
  id: string,
  values: Partial<CreateCatalogInput>,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase
    .from("transportadoras")
    .update({
      ...(values.nome ? { nome: values.nome.trim() } : {}),
      ...(values.slug ? { slug: values.slug } : {}),
    })
    .eq("id", id)
    .select("*")
    .single<TransportadoraRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function ativarTransportadora(
  id: string,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase
    .from("transportadoras")
    .update({ ativo: true })
    .eq("id", id)
    .select("*")
    .single<TransportadoraRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function inativarTransportadora(
  id: string,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase
    .from("transportadoras")
    .update({ ativo: false })
    .eq("id", id)
    .select("*")
    .single<TransportadoraRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function excluirTransportadoraDefinitivamente(
  id: string,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const { error } = await supabase
    .from("transportadoras")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}

export async function excluirTransportadora(
  id: string,
  context?: DatabaseContext,
) {
  return excluirTransportadoraDefinitivamente(id, context);
}

export async function getRelatorioDestinatarios(
  options?: ListOptions,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  let query = supabase
    .from("relatorio_destinatarios")
    .select("*")
    .order("nome", { ascending: true, nullsFirst: false })
    .order("email");

  if (!options?.incluirInativos) {
    query = query.eq("ativo", true);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query.returns<RelatorioDestinatarioRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function createRelatorioDestinatario(
  nome: string | null | undefined,
  email: string,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const normalizedEmail = validateEmailAddress(email);
  const normalizedName = optionalText(nome);

  const { data: existing, error: existingError } = await supabase
    .from("relatorio_destinatarios")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle<Pick<RelatorioDestinatarioRow, "id">>();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    throw new Error("Este e-mail ja esta cadastrado.");
  }

  const { data, error } = await supabase
    .from("relatorio_destinatarios")
    .insert({
      nome: normalizedName,
      email: normalizedEmail,
      ativo: true,
    })
    .select("*")
    .single<RelatorioDestinatarioRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function ativarRelatorioDestinatario(
  id: string,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase
    .from("relatorio_destinatarios")
    .update({ ativo: true })
    .eq("id", id)
    .select("*")
    .single<RelatorioDestinatarioRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function inativarRelatorioDestinatario(
  id: string,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase
    .from("relatorio_destinatarios")
    .update({ ativo: false })
    .eq("id", id)
    .select("*")
    .single<RelatorioDestinatarioRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function excluirRelatorioDestinatarioDefinitivamente(
  id: string,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const { error } = await supabase
    .from("relatorio_destinatarios")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}

export async function createRelatorioEnvioHistorico(
  input: CreateRelatorioEnvioHistoricoInput,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const destinatarios = Array.from(
    new Set(input.destinatarios.map((email) => validateEmailAddress(email))),
  );

  if (!destinatarios.length) {
    throw new Error("Informe ao menos um destinatario.");
  }

  const { data, error } = await supabase
    .from("relatorio_envios")
    .insert({
      destinatarios,
      assunto: requireText(input.assunto, "assunto"),
      filtros: input.filtros ?? {},
      status: input.status,
      erro: input.erro ?? null,
      enviado_em: input.enviado_em ?? nowIso(),
    })
    .select("*")
    .single<RelatorioEnvioRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createSessaoBipagem(
  input: CreateSessaoInput,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase
    .from("sessoes_bipagem")
    .insert(getSessaoPayload(input))
    .select("*")
    .single<SessaoBipagemRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function criarSessaoBipagem(
  input: CreateSessaoInput,
  context?: DatabaseContext,
) {
  return createSessaoBipagem(input, context);
}

export async function getPacotes(
  filters?: PacoteFilters,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  let query = supabase
    .from("pacotes")
    .select("*")
    .order("bipado_em", {
      ascending: false,
    });

  if (!filters?.incluirCancelados) {
    query = query.neq("status", "cancelado");
  }

  if (filters?.codigo) {
    query = query.eq("codigo", normalizeDatabaseTrackingCode(filters.codigo));
  }

  if (filters?.loja_id) {
    query = query.eq("loja_id", filters.loja_id);
  }

  if (filters?.marketplace_id) {
    query = query.eq("marketplace_id", filters.marketplace_id);
  }

  if (filters?.sessao_id) {
    query = query.eq("sessao_id", filters.sessao_id);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query.returns<PacoteRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

const pacoteComRelacionamentosSelect = `
  *,
  loja:lojas(*),
  marketplace:marketplaces(*),
  transportadora:transportadoras(*),
  sessao:sessoes_bipagem(*)
`;

const sessaoComRelacionamentosSelect = `
  *,
  loja:lojas(*),
  marketplace:marketplaces(*),
  transportadora:transportadoras(*)
`;

const cancelamentoComRelacionamentosSelect = `
  *,
  loja:lojas(*),
  marketplace:marketplaces(*),
  transportadora:transportadoras(*),
  sessao:sessoes_bipagem(*),
  pacote:pacotes(*)
`;

async function getItensSessaoBipagem(
  sessaoId: string,
  context: ResolvedDatabaseContext,
) {
  const { supabase } = context;
  const { data, error } = await supabase
    .from("itens_sessao_bipagem")
    .select("*")
    .eq("sessao_id", sessaoId)
    .eq("status", "pendente")
    .order("ordem", { ascending: false })
    .order("criado_em", { ascending: false })
    .returns<ItemSessaoBipagemRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getSessaoBipagemAbertaComItens(
  context?: DatabaseContext,
) {
  const databaseContext = await getDatabaseContext(context);
  const { supabase } = databaseContext;
  const { data: sessao, error } = await supabase
    .from("sessoes_bipagem")
    .select(sessaoComRelacionamentosSelect)
    .eq("status", "aberta")
    .order("iniciada_em", { ascending: false })
    .limit(1)
    .maybeSingle<SessaoComRelacionamentosRow>();

  if (error) {
    throw error;
  }

  if (!sessao) {
    return null;
  }

  return {
    sessao,
    itens: await getItensSessaoBipagem(sessao.id, databaseContext),
  } satisfies SessaoBipagemAbertaComItens;
}

export async function adicionarItemSessaoBipagem(
  input: CreateItemSessaoBipagemInput,
  context?: DatabaseContext,
): Promise<ItemSessaoBipagemRow[]> {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase.rpc("adicionar_item_sessao_bipagem", {
    p_sessao_id: input.sessao_id,
    p_codigo: input.codigo,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as ItemSessaoBipagemRow[];
}

export async function removerItemSessaoBipagem({
  itemId,
  status = "descartado",
}: {
  itemId: string;
  status?: "descartado" | "cancelado";
}, context?: DatabaseContext): Promise<ItemSessaoBipagemRow[]> {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase.rpc("remover_item_sessao_bipagem", {
    p_item_id: itemId,
    p_status: status,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as ItemSessaoBipagemRow[];
}

export async function finalizarSessaoBipagemAberta(
  sessaoId: string,
  context?: DatabaseContext,
): Promise<FinalizarSessaoBipagemResult> {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase.rpc("finalizar_sessao_bipagem", {
    p_sessao_id: sessaoId,
  });

  if (error) {
    throw error;
  }

  return data as FinalizarSessaoBipagemResult;
}

export async function cancelarSessaoBipagemAberta(
  sessaoId: string,
  context?: DatabaseContext,
): Promise<{ sessao_id: string; cancelada_em: string }> {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase.rpc("cancelar_sessao_bipagem", {
    p_sessao_id: sessaoId,
  });

  if (error) {
    throw error;
  }

  return data as { sessao_id: string; cancelada_em: string };
}

export async function getPacotesComRelacionamentos(
  options?: PacoteFilters,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  let query = supabase
    .from("pacotes")
    .select(pacoteComRelacionamentosSelect)
    .order("bipado_em", { ascending: false });

  if (!options?.incluirCancelados) {
    query = query.neq("status", "cancelado");
  }

  if (options?.codigo) {
    query = query.eq("codigo", normalizeDatabaseTrackingCode(options.codigo));
  }

  if (options?.loja_id) {
    query = query.eq("loja_id", options.loja_id);
  }

  if (options?.marketplace_id) {
    query = query.eq("marketplace_id", options.marketplace_id);
  }

  if (options?.sessao_id) {
    query = query.eq("sessao_id", options.sessao_id);
  }

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query.returns<PacoteComRelacionamentosRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listarPacotesComJoins(
  options?: PacoteFilters,
  context?: DatabaseContext,
) {
  return getPacotesComRelacionamentos(options, context);
}

export async function getSessoesBipagemComRelacionamentos(
  options?: SessaoBipagemFilters,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  let query = supabase
    .from("sessoes_bipagem")
    .select(sessaoComRelacionamentosSelect)
    .order("finalizada_em", { ascending: false, nullsFirst: false })
    .order("iniciada_em", { ascending: false });

  if (options?.loja_id) {
    query = query.eq("loja_id", options.loja_id);
  }

  if (options?.marketplace_id) {
    query = query.eq("marketplace_id", options.marketplace_id);
  }

  if (options && "transportadora_id" in options) {
    if (options.transportadora_id === null) {
      query = query.is("transportadora_id", null);
    } else if (options.transportadora_id) {
      query = query.eq("transportadora_id", options.transportadora_id);
    }
  }

  if (options?.status) {
    query = query.eq("status", options.status);
  } else if (!options?.incluirCanceladas) {
    query = query.neq("status", "cancelada");
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query.returns<SessaoComRelacionamentosRow[]>();

  if (error) {
    throw error;
  }

  const sessoes = data ?? [];
  if (!sessoes.length) {
    return [];
  }

  let pacotesQuery = supabase
    .from("pacotes")
    .select("sessao_id, status")
    .in(
      "sessao_id",
      sessoes.map((item) => item.id),
    );

  if (!options?.incluirCanceladosNoTotal) {
    pacotesQuery = pacotesQuery.neq("status", "cancelado");
  }

  const { data: pacoteRows, error: pacoteError } =
    await pacotesQuery.returns<Array<Pick<PacoteRow, "sessao_id" | "status">>>();

  if (pacoteError) {
    throw pacoteError;
  }

  const totalsBySession = new Map<string, number>();
  for (const pacote of pacoteRows ?? []) {
    if (!pacote.sessao_id) {
      continue;
    }

    totalsBySession.set(
      pacote.sessao_id,
      (totalsBySession.get(pacote.sessao_id) ?? 0) + 1,
    );
  }

  return sessoes.map((sessao) => ({
    ...sessao,
    total_pacotes: totalsBySession.get(sessao.id) ?? 0,
  }));
}

export async function listarSessoesLotesComJoins(
  options?: SessaoBipagemFilters,
  context?: DatabaseContext,
) {
  return getSessoesBipagemComRelacionamentos(options, context);
}

export async function getMovimentacoes(
  filters?: MovimentacaoFilters,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  let query = supabase
    .from("movimentacoes")
    .select("*")
    .order("criada_em", { ascending: false });

  if (filters?.loja_id) {
    query = query.eq("loja_id", filters.loja_id);
  }

  if (filters?.pacote_id) {
    query = query.eq("pacote_id", filters.pacote_id);
  }

  if (filters?.sessao_id) {
    query = query.eq("sessao_id", filters.sessao_id);
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query.returns<MovimentacaoRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getPacotesCanceladosComRelacionamentos(
  options?: PacoteCanceladoFilters,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  let query = supabase
    .from("pacotes_cancelados")
    .select(cancelamentoComRelacionamentosSelect)
    .order("cancelado_em", { ascending: false });

  if (options?.codigo) {
    query = query.eq(
      "codigo_pacote",
      normalizeDatabaseTrackingCode(options.codigo),
    );
  }

  if (options?.loja_id) {
    query = query.eq("loja_id", options.loja_id);
  }

  if (options?.marketplace_id) {
    query = query.eq("marketplace_id", options.marketplace_id);
  }

  if (options && "sessao_id" in options) {
    if (options.sessao_id === null) {
      query = query.is("sessao_id", null);
    } else if (options.sessao_id) {
      query = query.eq("sessao_id", options.sessao_id);
    }
  }

  if (options && "transportadora_id" in options) {
    if (options.transportadora_id === null) {
      query = query.is("transportadora_id", null);
    } else if (options.transportadora_id) {
      query = query.eq("transportadora_id", options.transportadora_id);
    }
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } =
    await query.returns<PacoteCanceladoComRelacionamentosRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listarPacotesCanceladosComJoins(
  options?: PacoteCanceladoFilters,
  context?: DatabaseContext,
) {
  return getPacotesCanceladosComRelacionamentos(options, context);
}

export async function getPacoteAtivoPorCodigo(
  codigo: string,
  filters: Pick<PacoteFilters, "loja_id">,
  context?: DatabaseContext,
) {
  const normalizedCode = normalizeDatabaseTrackingCode(codigo);
  const lojaId = requireText(filters.loja_id, "loja_id");
  if (!normalizedCode) {
    return null;
  }

  const { supabase } = await getDatabaseContext(context);
  const query = supabase
    .from("pacotes")
    .select(pacoteComRelacionamentosSelect)
    .eq("codigo", normalizedCode)
    .eq("loja_id", lojaId)
    .neq("status", "cancelado")
    .limit(1);

  const { data, error } = await query.maybeSingle<PacoteComRelacionamentosRow>();

  if (error) {
    throw error;
  }

  if (data) {
    return data;
  }

  const rows = await getPacotesComRelacionamentos(filters, { supabase });

  return (
    rows.find(
      (item) => normalizeDatabaseTrackingCode(item.codigo) === normalizedCode,
    ) ?? null
  );
}

export async function buscarPacoteAtivoPorCodigoNormalizado(
  codigo: string,
  filters: Pick<PacoteFilters, "loja_id">,
  context?: DatabaseContext,
) {
  return getPacoteAtivoPorCodigo(codigo, filters, context);
}

export async function createPacote(
  input: CreatePacoteInput,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase
    .from("pacotes")
    .insert(
      getPacotePayload(input, nowIso(), { requireSessaoId: true }),
    )
    .select("*")
    .single<PacoteRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createPacotes(
  inputs: CreatePacoteInput[],
  context?: DatabaseContext,
) {
  if (!inputs.length) {
    return [];
  }

  const { supabase } = await getDatabaseContext(context);
  const bipadoEm = nowIso();
  const { data, error } = await supabase
    .from("pacotes")
    .insert(
      inputs.map((input) =>
        getPacotePayload(input, bipadoEm, { requireSessaoId: true }),
      ),
    )
    .select("*")
    .returns<PacoteRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function inserirPacotesSessao(
  inputs: CreatePacoteInput[],
  context?: DatabaseContext,
) {
  return createPacotes(inputs, context);
}

export async function createMovimentacao(
  input: CreateMovimentacaoInput,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase
    .from("movimentacoes")
    .insert(getMovimentacaoPayload(input))
    .select("*")
    .single<MovimentacaoRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function criarMovimentacao(
  input: CreateMovimentacaoInput,
  context?: DatabaseContext,
) {
  return createMovimentacao(input, context);
}

export async function createMovimentacoes(
  inputs: CreateMovimentacaoInput[],
  context?: DatabaseContext,
) {
  if (!inputs.length) {
    return [];
  }

  const { supabase } = await getDatabaseContext(context);
  const criadaEm = nowIso();
  const { data, error } = await supabase
    .from("movimentacoes")
    .insert(
      inputs.map((input) =>
        getMovimentacaoPayload(input, criadaEm),
      ),
    )
    .select("*")
    .returns<MovimentacaoRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function criarMovimentacoes(
  inputs: CreateMovimentacaoInput[],
  context?: DatabaseContext,
) {
  return createMovimentacoes(inputs, context);
}

export async function finalizarSessao({
  sessaoId,
  pacotesIds,
  finalizadaEm = nowIso(),
  atualizarPacotes = true,
}: {
  sessaoId: string;
  pacotesIds?: string[];
  finalizadaEm?: string;
  atualizarPacotes?: boolean;
}, context?: DatabaseContext) {
  const { supabase } = await getDatabaseContext(context);
  const { data: sessao, error: sessaoError } = await supabase
    .from("sessoes_bipagem")
    .update({ status: "finalizada", finalizada_em: finalizadaEm })
    .eq("id", sessaoId)
    .select("*")
    .single<SessaoBipagemRow>();

  if (sessaoError) {
    throw sessaoError;
  }

  if (atualizarPacotes) {
    let pacotesQuery = supabase
      .from("pacotes")
      .update({ status: "finalizado", finalizado_em: finalizadaEm })
      .eq("loja_id", sessao.loja_id)
      .neq("status", "cancelado");

    if (pacotesIds?.length) {
      pacotesQuery = pacotesQuery.in("id", pacotesIds);
    } else {
      pacotesQuery = pacotesQuery.eq("sessao_id", sessaoId);
    }

    const { error: pacotesError } = await pacotesQuery;

    if (pacotesError) {
      throw pacotesError;
    }
  }

  return sessao;
}

export async function finalizarSessaoBipagem(
  input: Parameters<typeof finalizarSessao>[0],
  context?: DatabaseContext,
) {
  return finalizarSessao(input, context);
}

export async function cancelarPacotes({
  cancelamentos,
  movimentacoes = [],
}: {
  cancelamentos: CreateCancelamentoInput[];
  movimentacoes?: CreateMovimentacaoInput[];
}, context?: DatabaseContext) {
  const { supabase } = await getDatabaseContext(context);
  const canceladoEm = nowIso();
  const cancelamentoPayloads = cancelamentos.map((item) =>
    getCancelamentoPayload(item, canceladoEm),
  );
  const lojaId = requireText(cancelamentoPayloads[0]?.loja_id, "loja_id");

  if (cancelamentoPayloads.some((item) => item.loja_id !== lojaId)) {
    throw new Error("Todos os cancelamentos do lote devem pertencer a mesma loja.");
  }

  if (movimentacoes.some((item) => item.loja_id !== lojaId)) {
    throw new Error("As movimentacoes devem pertencer a loja do cancelamento.");
  }
  const pacoteIds = Array.from(
    new Set(
      cancelamentoPayloads
        .map((item) => item.pacote_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (pacoteIds.length) {
    const { data: pacotesAtuais, error: pacotesAtuaisError } = await supabase
      .from("pacotes")
      .select("id, status, loja_id")
      .eq("loja_id", lojaId)
      .in("id", pacoteIds)
      .returns<Array<Pick<PacoteRow, "id" | "status" | "loja_id">>>();

    if (pacotesAtuaisError) {
      throw pacotesAtuaisError;
    }

    const pacotesEncontrados = new Set(
      (pacotesAtuais ?? []).map((item) => item.id),
    );
    const pacoteNaoEncontrado = pacoteIds.find(
      (id) => !pacotesEncontrados.has(id),
    );

    if (pacoteNaoEncontrado) {
      throw new Error(`Pacote ${pacoteNaoEncontrado} nao encontrado.`);
    }

    const pacoteCancelado = (pacotesAtuais ?? []).find(
      (item) => item.status.trim().toLowerCase() === "cancelado",
    );

    if (pacoteCancelado) {
      throw new Error(`Pacote ${pacoteCancelado.id} ja esta cancelado.`);
    }
  }

  const idsParaAtualizar = cancelamentoPayloads
    .map((item) => item.pacote_id)
    .filter((id): id is string => Boolean(id));

  const { data, error } = await supabase
    .from("pacotes_cancelados")
    .insert(cancelamentoPayloads)
    .select("*")
    .returns<PacoteCanceladoRow[]>();

  if (error) {
    throw error;
  }

  if (idsParaAtualizar.length) {
    const { error: pacotesError } = await supabase
      .from("pacotes")
      .update({ status: "cancelado", cancelado_em: canceladoEm })
      .eq("loja_id", lojaId)
      .neq("status", "cancelado")
      .in("id", idsParaAtualizar);

    if (pacotesError) {
      throw pacotesError;
    }
  }

  if (movimentacoes.length) {
    const { error: movimentacoesError } = await supabase
      .from("movimentacoes")
      .insert(
        movimentacoes.map((item) =>
          getMovimentacaoPayload(item, canceladoEm),
        ),
      );

    if (movimentacoesError) {
      throw movimentacoesError;
    }
  }

  return data ?? [];
}

export async function finalizarCancelamentosEmLote(
  cancelamentos: FinalizarCancelamentoLoteInput[],
  context?: DatabaseContext,
) {
  if (!cancelamentos.length) {
    return [];
  }

  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase.rpc("finalizar_cancelamentos_lote", {
    p_cancelamentos: cancelamentos.map((item) => ({
      pacote_id: item.pacote_id,
      justificativa_geral: item.justificativa_geral,
      justificativa_individual: item.justificativa_individual ?? null,
    })),
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as PacoteCanceladoRow[];
}

export async function cancelarPacote(
  input: CancelarPacoteInput,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const payload = getCancelarPacotePayload(input);
  const canceladoEm = payload.cancelado_em;
  const lojaId = requireText(payload.loja_id, "loja_id");

  const { data: pacoteAtual, error: pacoteAtualError } = await supabase
    .from("pacotes")
    .select("*")
    .eq("id", payload.pacote_id)
    .eq("loja_id", lojaId)
    .single<PacoteRow>();

  if (pacoteAtualError) {
    throw pacoteAtualError;
  }

  if (pacoteAtual.status.trim().toLowerCase() === "cancelado") {
    throw new Error("Pacote ja esta cancelado.");
  }

  const { data: pacote, error: pacoteError } = await supabase
    .from("pacotes")
    .update({ status: "cancelado", cancelado_em: canceladoEm })
    .eq("id", payload.pacote_id)
    .eq("loja_id", lojaId)
    .neq("status", "cancelado")
    .select("*")
    .single<PacoteRow>();

  if (pacoteError) {
    throw pacoteError;
  }

  const { data: cancelamento, error: cancelamentoError } = await supabase
    .from("pacotes_cancelados")
    .insert({
      pacote_id: payload.pacote_id,
      codigo_pacote: payload.codigo_pacote,
      loja_id: pacote.loja_id,
      marketplace_id: payload.marketplace_id ?? pacote.marketplace_id,
      transportadora_id: payload.transportadora_id ?? pacote.transportadora_id,
      sessao_id: payload.sessao_id ?? pacote.sessao_id,
      tipo_operacao: payload.tipo_operacao ?? pacote.tipo_operacao,
      melhor_envio: payload.melhor_envio ?? pacote.melhor_envio,
      justificativa_geral: payload.justificativa_geral,
      justificativa_individual: payload.justificativa_individual,
      bipado_em: payload.bipado_em ?? pacote.bipado_em,
      cancelado_em: canceladoEm,
    })
    .select("*")
    .single<PacoteCanceladoRow>();

  if (cancelamentoError) {
    throw cancelamentoError;
  }

  const { data: movimentacao, error: movimentacaoError } = await supabase
    .from("movimentacoes")
    .insert({
      pacote_id: payload.pacote_id,
      loja_id: pacote.loja_id,
      sessao_id: payload.sessao_id ?? pacote.sessao_id,
      tipo_movimentacao: payload.tipo_movimentacao,
      descricao:
        payload.descricao_movimentacao ??
        `Pacote ${payload.codigo_pacote} cancelado.`,
      criada_em: canceladoEm,
    })
    .select("*")
    .single<MovimentacaoRow>();

  if (movimentacaoError) {
    throw movimentacaoError;
  }

  return {
    pacote,
    cancelamento,
    movimentacao,
  };
}

export async function cancelarPacoteComMovimentacao(
  input: CancelarPacoteInput,
  context?: DatabaseContext,
) {
  return cancelarPacote(input, context);
}

export async function updatePacoteCanceladoJustificativa(
  id: string,
  justificativaIndividual: string,
  lojaId: string,
  context?: DatabaseContext,
) {
  const { supabase } = await getDatabaseContext(context);
  const { data, error } = await supabase
    .from("pacotes_cancelados")
    .update({ justificativa_individual: justificativaIndividual })
    .eq("id", id)
    .eq("loja_id", requireText(lojaId, "loja_id"))
    .select("*")
    .single<PacoteCanceladoRow>();

  if (error) {
    throw error;
  }

  return data;
}
