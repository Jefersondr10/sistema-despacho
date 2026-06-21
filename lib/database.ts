import type { Carrier, Marketplace, Store } from "@/app/_lib/mock-data";
import { getSupabaseClient } from "@/lib/supabaseClient";

export type TipoOperacao = "coleta" | "postagem";

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

export type SessaoBipagemRow = {
  id: string;
  loja_id: string;
  marketplace_id: string;
  tipo_operacao: TipoOperacao;
  melhor_envio: boolean;
  transportadora_id: string | null;
  status: string;
  iniciada_em: string;
  finalizada_em: string | null;
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
  status: string;
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

type ListOptions = {
  incluirInativos?: boolean;
  limit?: number;
};

export type CreateCatalogInput = {
  nome: string;
  slug?: string;
};

type CatalogInput = CreateCatalogInput | string;

export type CreateSessaoInput = {
  loja_id: string;
  marketplace_id: string;
  tipo_operacao: TipoOperacao;
  melhor_envio?: boolean;
  transportadora_id?: string | null;
  status?: string;
  iniciada_em?: string;
};

export type CreatePacoteInput = {
  codigo: string;
  loja_id: string;
  marketplace_id: string;
  transportadora_id?: string | null;
  sessao_id?: string | null;
  tipo_operacao: TipoOperacao;
  melhor_envio?: boolean;
  status?: string;
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

export function formatDatabaseError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
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

export async function getLojas(options?: ListOptions) {
  const supabase = getSupabaseClient();
  let query = supabase.from("lojas").select("*").order("nome");

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

export async function createLoja(input: CatalogInput) {
  const supabase = getSupabaseClient();
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

export async function updateLoja(id: string, values: Partial<CreateCatalogInput>) {
  const supabase = getSupabaseClient();
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

export async function ativarLoja(id: string) {
  const supabase = getSupabaseClient();
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

export async function inativarLoja(id: string) {
  const supabase = getSupabaseClient();
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

export async function excluirLojaDefinitivamente(id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("lojas").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function excluirLoja(id: string) {
  return excluirLojaDefinitivamente(id);
}

export async function getMarketplaces(options?: ListOptions) {
  const supabase = getSupabaseClient();
  let query = supabase.from("marketplaces").select("*").order("nome");

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

export async function createMarketplace(input: CatalogInput) {
  const supabase = getSupabaseClient();
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
) {
  const supabase = getSupabaseClient();
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

export async function ativarMarketplace(id: string) {
  const supabase = getSupabaseClient();
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

export async function inativarMarketplace(id: string) {
  const supabase = getSupabaseClient();
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

export async function excluirMarketplaceDefinitivamente(id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("marketplaces").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function excluirMarketplace(id: string) {
  return excluirMarketplaceDefinitivamente(id);
}

export async function getTransportadoras(options?: ListOptions) {
  const supabase = getSupabaseClient();
  let query = supabase.from("transportadoras").select("*").order("nome");

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

export async function createTransportadora(input: CatalogInput) {
  const supabase = getSupabaseClient();
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
) {
  const supabase = getSupabaseClient();
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

export async function ativarTransportadora(id: string) {
  const supabase = getSupabaseClient();
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

export async function inativarTransportadora(id: string) {
  const supabase = getSupabaseClient();
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

export async function excluirTransportadoraDefinitivamente(id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("transportadoras").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function excluirTransportadora(id: string) {
  return excluirTransportadoraDefinitivamente(id);
}

export async function createSessaoBipagem(input: CreateSessaoInput) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("sessoes_bipagem")
    .insert({
      loja_id: input.loja_id,
      marketplace_id: input.marketplace_id,
      tipo_operacao: input.tipo_operacao,
      melhor_envio: input.melhor_envio ?? false,
      transportadora_id: input.transportadora_id ?? null,
      status: input.status ?? "aberta",
      iniciada_em: input.iniciada_em ?? nowIso(),
    })
    .select("*")
    .single<SessaoBipagemRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function getPacotes(filters?: {
  loja_id?: string;
  marketplace_id?: string;
  sessao_id?: string;
  status?: string;
}) {
  const supabase = getSupabaseClient();
  let query = supabase.from("pacotes").select("*").order("bipado_em", {
    ascending: false,
  });

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

  const { data, error } = await query.returns<PacoteRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function createPacote(input: CreatePacoteInput) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("pacotes")
    .insert({
      codigo: input.codigo.trim(),
      loja_id: input.loja_id,
      marketplace_id: input.marketplace_id,
      transportadora_id: input.transportadora_id ?? null,
      sessao_id: input.sessao_id ?? null,
      tipo_operacao: input.tipo_operacao,
      melhor_envio: input.melhor_envio ?? false,
      status: input.status ?? "bipado",
      bipado_em: input.bipado_em ?? nowIso(),
    })
    .select("*")
    .single<PacoteRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createMovimentacao(input: CreateMovimentacaoInput) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("movimentacoes")
    .insert({
      pacote_id: input.pacote_id ?? null,
      loja_id: input.loja_id,
      sessao_id: input.sessao_id ?? null,
      tipo_movimentacao: input.tipo_movimentacao,
      descricao: input.descricao ?? null,
      criada_em: input.criada_em ?? nowIso(),
    })
    .select("*")
    .single<MovimentacaoRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function finalizarSessao({
  sessaoId,
  pacotesIds = [],
  finalizadaEm = nowIso(),
}: {
  sessaoId: string;
  pacotesIds?: string[];
  finalizadaEm?: string;
}) {
  const supabase = getSupabaseClient();
  const { data: sessao, error: sessaoError } = await supabase
    .from("sessoes_bipagem")
    .update({ status: "finalizada", finalizada_em: finalizadaEm })
    .eq("id", sessaoId)
    .select("*")
    .single<SessaoBipagemRow>();

  if (sessaoError) {
    throw sessaoError;
  }

  if (pacotesIds.length) {
    const { error: pacotesError } = await supabase
      .from("pacotes")
      .update({ status: "finalizado", finalizado_em: finalizadaEm })
      .in("id", pacotesIds);

    if (pacotesError) {
      throw pacotesError;
    }
  }

  return sessao;
}

export async function cancelarPacotes({
  cancelamentos,
  movimentacoes = [],
}: {
  cancelamentos: CreateCancelamentoInput[];
  movimentacoes?: CreateMovimentacaoInput[];
}) {
  const supabase = getSupabaseClient();
  const canceladoEm = nowIso();
  const pacoteIds = cancelamentos
    .map((item) => item.pacote_id)
    .filter((id): id is string => Boolean(id));

  const { data, error } = await supabase
    .from("pacotes_cancelados")
    .insert(
      cancelamentos.map((item) => ({
        pacote_id: item.pacote_id ?? null,
        codigo_pacote: item.codigo_pacote.trim(),
        loja_id: item.loja_id,
        marketplace_id: item.marketplace_id ?? null,
        transportadora_id: item.transportadora_id ?? null,
        sessao_id: item.sessao_id ?? null,
        tipo_operacao: item.tipo_operacao ?? null,
        melhor_envio: item.melhor_envio ?? null,
        justificativa_geral: item.justificativa_geral ?? null,
        justificativa_individual: item.justificativa_individual ?? null,
        bipado_em: item.bipado_em ?? null,
        cancelado_em: item.cancelado_em ?? canceladoEm,
      })),
    )
    .select("*")
    .returns<PacoteCanceladoRow[]>();

  if (error) {
    throw error;
  }

  if (pacoteIds.length) {
    const { error: pacotesError } = await supabase
      .from("pacotes")
      .update({ status: "cancelado", cancelado_em: canceladoEm })
      .in("id", pacoteIds);

    if (pacotesError) {
      throw pacotesError;
    }
  }

  if (movimentacoes.length) {
    const { error: movimentacoesError } = await supabase
      .from("movimentacoes")
      .insert(
        movimentacoes.map((item) => ({
          pacote_id: item.pacote_id ?? null,
          loja_id: item.loja_id,
          sessao_id: item.sessao_id ?? null,
          tipo_movimentacao: item.tipo_movimentacao,
          descricao: item.descricao ?? null,
          criada_em: item.criada_em ?? canceladoEm,
        })),
      );

    if (movimentacoesError) {
      throw movimentacoesError;
    }
  }

  return data ?? [];
}
