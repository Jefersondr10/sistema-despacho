"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  ConfirmDialog,
  EmptyState,
  FeedbackMessage,
  StatusBadge,
} from "@/app/_components/ui";
import type { Carrier, Marketplace, Store } from "@/app/_lib/mock-data";
import {
  ativarRelatorioDestinatario,
  ativarLoja,
  ativarMarketplace,
  ativarTransportadora,
  createLoja,
  createMarketplace,
  createRelatorioDestinatario,
  createTransportadora,
  excluirLojaDefinitivamente,
  excluirMarketplaceDefinitivamente,
  excluirRelatorioDestinatarioDefinitivamente,
  excluirTransportadoraDefinitivamente,
  formatDatabaseError,
  getLojas,
  getMarketplaces,
  getRelatorioDestinatarios,
  getTransportadoras,
  inativarLoja,
  inativarMarketplace,
  inativarRelatorioDestinatario,
  inativarTransportadora,
  mapLojaRowToStore,
  mapMarketplaceRowToMarketplace,
  mapTransportadoraRowToCarrier,
  type RelatorioDestinatarioRow,
} from "@/lib/database";
import {
  isSupabaseConfigured,
  SUPABASE_NOT_CONFIGURED_MESSAGE,
} from "@/lib/supabaseClient";

type CatalogKind = "stores" | "marketplaces" | "carriers";
type ActionKind = CatalogKind | "reportEmails";

type CatalogItem = {
  id: string;
  name: string;
  email?: string;
  status?: string;
};

type Notice = {
  tone: "success" | "warning" | "danger" | "neutral";
  text: string;
};

type PendingAction = {
  kind: ActionKind;
  item: CatalogItem;
  action: "activate" | "deactivate" | "delete-first" | "delete-final";
};

type CatalogState = {
  stores: Store[];
  marketplaces: Marketplace[];
  carriers: Carrier[];
  reportEmails: RelatorioDestinatarioRow[];
};

const catalogLabels: Record<ActionKind, string> = {
  stores: "loja",
  marketplaces: "marketplace",
  carriers: "transportadora",
  reportEmails: "e-mail de relatório",
};

function isInactive(item: CatalogItem) {
  return item.status === "Inativa" || item.status === "Inativo";
}

function mapReportEmailToCatalogItem(
  item: RelatorioDestinatarioRow,
): CatalogItem {
  return {
    id: item.id,
    name: item.nome?.trim() || item.email,
    email: item.email,
    status: item.ativo ? "Ativo" : "Inativo",
  };
}

function getActionTitle(action: PendingAction["action"]) {
  if (action === "activate") return "Ativar cadastro";
  if (action === "deactivate") return "Inativar cadastro";
  if (action === "delete-first") return "Excluir definitivamente";
  return "Confirmacao final";
}

function getActionMessage(pending: PendingAction) {
  const label = catalogLabels[pending.kind];
  const article = pending.kind === "reportEmails" ? "o" : "a";
  const itemName = pending.item.email
    ? `${pending.item.name} (${pending.item.email})`
    : pending.item.name;

  if (pending.action === "activate") {
    return `Deseja ativar ${article} ${label} "${itemName}"?`;
  }
  if (pending.action === "deactivate") {
    return `Deseja inativar ${article} ${label} "${itemName}"? O historico sera preservado.`;
  }
  if (pending.action === "delete-first") {
    return `Esta acao tentara excluir definitivamente ${article} ${label} "${itemName}" do Supabase. Se houver vinculos, a exclusao pode ser bloqueada.`;
  }
  return `Ultima confirmacao: excluir definitivamente ${article} ${label} "${itemName}"? Esta acao nao pode ser desfeita.`;
}

function getConfirmLabel(action: PendingAction["action"]) {
  if (action === "activate") return "Ativar";
  if (action === "deactivate") return "Inativar";
  if (action === "delete-first") return "Continuar";
  return "Excluir definitivamente";
}

function CatalogItemActions({
  inactive,
  disabled,
  saving,
  onActivate,
  onDeactivate,
  onDelete,
}: {
  inactive: boolean;
  disabled?: boolean;
  saving?: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 sm:justify-end">
      {inactive ? (
        <button
          type="button"
          disabled={disabled || saving}
          onClick={onActivate}
          className="inline-flex min-h-8 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
          Ativar
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled || saving}
          onClick={onDeactivate}
          className="inline-flex min-h-8 items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
          Inativar
        </button>
      )}
      <button
        type="button"
        disabled={disabled || saving}
        onClick={onDelete}
        className="inline-flex min-h-8 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
      >
        Excluir definitivo
      </button>
    </div>
  );
}

function CatalogListItem({
  name,
  email,
  status,
  inactive,
  disabled,
  saving,
  onActivate,
  onDeactivate,
  onDelete,
}: {
  name: string;
  email?: string;
  status?: string;
  inactive: boolean;
  disabled?: boolean;
  saving?: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold leading-5 text-slate-950">
          {name}
        </p>
        {email ? (
          <p className="mt-1 break-all text-sm leading-5 text-slate-500">
            {email}
          </p>
        ) : null}
        {status ? (
          <div className="mt-1 flex">
            <StatusBadge status={status} />
          </div>
        ) : null}
      </div>
      <CatalogItemActions
        inactive={inactive}
        disabled={disabled}
        saving={saving}
        onActivate={onActivate}
        onDeactivate={onDeactivate}
        onDelete={onDelete}
      />
    </div>
  );
}

function CatalogSection({
  title,
  description,
  placeholder,
  items,
  disabled,
  saving,
  onAdd,
  onActivate,
  onDeactivate,
  onDelete,
}: {
  title: string;
  description: string;
  placeholder: string;
  items: CatalogItem[];
  disabled?: boolean;
  saving?: boolean;
  onAdd: (name: string) => Promise<boolean>;
  onActivate: (item: CatalogItem) => void;
  onDeactivate: (item: CatalogItem) => void;
  onDelete: (item: CatalogItem) => void;
}) {
  const [name, setName] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onAdd(name);
    if (saved) {
      setName("");
    }
  }

  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-3">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      <div className="p-3">
        <form
          onSubmit={submit}
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={disabled || saving}
            className="min-h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            placeholder={placeholder}
          />
          <button
            type="submit"
            disabled={disabled || saving}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto sm:min-w-28"
          >
            {saving ? "Salvando..." : "Cadastrar"}
          </button>
        </form>

        <div className="mt-3">
          {items.length ? (
            <div className="grid gap-2">
              {items.map((item) => {
                const inactive = isInactive(item);
                return (
                  <CatalogListItem
                    key={item.id}
                    name={item.name}
                    status={item.status}
                    inactive={inactive}
                    disabled={disabled}
                    saving={saving}
                    onActivate={() => onActivate(item)}
                    onDeactivate={() => onDeactivate(item)}
                    onDelete={() => onDelete(item)}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState>Nenhum item cadastrado no Supabase.</EmptyState>
          )}
        </div>
      </div>
    </section>
  );
}

function ReportEmailSection({
  items,
  disabled,
  saving,
  onAdd,
  onActivate,
  onDeactivate,
  onDelete,
}: {
  items: RelatorioDestinatarioRow[];
  disabled?: boolean;
  saving?: boolean;
  onAdd: (nome: string, email: string) => Promise<boolean>;
  onActivate: (item: RelatorioDestinatarioRow) => void;
  onDeactivate: (item: RelatorioDestinatarioRow) => void;
  onDelete: (item: RelatorioDestinatarioRow) => void;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onAdd(nome, email);
    if (saved) {
      setNome("");
      setEmail("");
    }
  }

  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-3">
        <h2 className="text-base font-semibold text-slate-950">
          E-mails de Relatório
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Cadastre os destinatários que poderão receber relatórios por e-mail.
        </p>
      </div>

      <div className="p-3">
        <form
          onSubmit={submit}
          className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_auto]"
        >
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Nome/apelido
            </span>
            <input
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              disabled={disabled || saving}
            className="min-h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              placeholder="Financeiro"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              E-mail
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={disabled || saving}
            className="min-h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              placeholder="financeiro@empresa.com"
            />
          </label>
          <button
            type="submit"
            disabled={disabled || saving}
            className="inline-flex min-h-10 w-full items-center justify-center self-end rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 lg:w-auto lg:min-w-28"
          >
            {saving ? "Salvando..." : "Cadastrar"}
          </button>
        </form>

        <div className="mt-3">
          {items.length ? (
            <div className="grid gap-2">
              {items.map((item) => {
                const inactive = !item.ativo;
                return (
                  <CatalogListItem
                    key={item.id}
                    name={item.nome?.trim() || "Sem apelido"}
                    email={item.email}
                    status={item.ativo ? "Ativo" : "Inativo"}
                    inactive={inactive}
                    disabled={disabled}
                    saving={saving}
                    onActivate={() => onActivate(item)}
                    onDeactivate={() => onDeactivate(item)}
                    onDelete={() => onDelete(item)}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState>Nenhum e-mail cadastrado no Supabase.</EmptyState>
          )}
        </div>
      </div>
    </section>
  );
}

export function CadastrosView() {
  const [catalogs, setCatalogs] = useState<CatalogState>({
    stores: [],
    marketplaces: [],
    carriers: [],
    reportEmails: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const supabaseConfigured = isSupabaseConfigured();

  const loadCatalogs = useCallback(async () => {
    if (!supabaseConfigured) {
      setLoading(false);
      setNotice({
        tone: "warning",
        text: SUPABASE_NOT_CONFIGURED_MESSAGE,
      });
      return;
    }

    setLoading(true);

    try {
      const [
        lojasRows,
        marketplacesRows,
        transportadorasRows,
        relatorioDestinatariosRows,
      ] = await Promise.all([
        getLojas({ incluirInativos: true }),
        getMarketplaces({ incluirInativos: true }),
        getTransportadoras({ incluirInativos: true }),
        getRelatorioDestinatarios({ incluirInativos: true }),
      ]);

      setCatalogs({
        stores: lojasRows.map(mapLojaRowToStore),
        marketplaces: marketplacesRows.map(mapMarketplaceRowToMarketplace),
        carriers: transportadorasRows.map(mapTransportadoraRowToCarrier),
        reportEmails: relatorioDestinatariosRows,
      });
    } catch (error) {
      setNotice({
        tone: "danger",
        text: `Erro ao carregar cadastros: ${formatDatabaseError(error)}`,
      });
    } finally {
      setLoading(false);
    }
  }, [supabaseConfigured]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        void loadCatalogs();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadCatalogs]);

  async function handleCreate(kind: CatalogKind, name: string) {
    const cleanName = name.trim();
    if (!cleanName) {
      setNotice({ tone: "warning", text: "Informe um nome valido para cadastrar." });
      return false;
    }

    setSaving(true);
    try {
      if (kind === "stores") {
        await createLoja(cleanName);
      } else if (kind === "marketplaces") {
        await createMarketplace(cleanName);
      } else {
        await createTransportadora(cleanName);
      }

      setNotice({ tone: "success", text: "Cadastro salvo com sucesso." });
      await loadCatalogs();
      return true;
    } catch (error) {
      setNotice({
        tone: "danger",
        text: `Erro ao salvar cadastro: ${formatDatabaseError(error)}`,
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateReportEmail(nome: string, email: string) {
    setSaving(true);
    try {
      await createRelatorioDestinatario(nome, email);
      setNotice({ tone: "success", text: "E-mail de relatorio salvo com sucesso." });
      await loadCatalogs();
      return true;
    } catch (error) {
      setNotice({
        tone: "danger",
        text: `Erro ao salvar e-mail: ${formatDatabaseError(error)}`,
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: PendingAction) {
    setSaving(true);
    try {
      if (action.action === "activate") {
        if (action.kind === "stores") await ativarLoja(action.item.id);
        if (action.kind === "marketplaces") await ativarMarketplace(action.item.id);
        if (action.kind === "carriers") await ativarTransportadora(action.item.id);
        if (action.kind === "reportEmails") {
          await ativarRelatorioDestinatario(action.item.id);
        }
        setNotice({ tone: "success", text: "Cadastro ativado." });
      }

      if (action.action === "deactivate") {
        if (action.kind === "stores") await inativarLoja(action.item.id);
        if (action.kind === "marketplaces") await inativarMarketplace(action.item.id);
        if (action.kind === "carriers") await inativarTransportadora(action.item.id);
        if (action.kind === "reportEmails") {
          await inativarRelatorioDestinatario(action.item.id);
        }
        setNotice({ tone: "neutral", text: "Cadastro inativado." });
      }

      if (action.action === "delete-final") {
        if (action.kind === "stores") await excluirLojaDefinitivamente(action.item.id);
        if (action.kind === "marketplaces") await excluirMarketplaceDefinitivamente(action.item.id);
        if (action.kind === "carriers") await excluirTransportadoraDefinitivamente(action.item.id);
        if (action.kind === "reportEmails") {
          await excluirRelatorioDestinatarioDefinitivamente(action.item.id);
        }
        setNotice({ tone: "success", text: "Cadastro excluido definitivamente." });
      }

      await loadCatalogs();
    } catch (error) {
      setNotice({
        tone: "danger",
        text: `Erro ao atualizar cadastro: ${formatDatabaseError(error)}`,
      });
    } finally {
      setSaving(false);
      setPendingAction(null);
    }
  }

  function confirmPendingAction() {
    if (!pendingAction) return;

    if (pendingAction.action === "delete-first") {
      setPendingAction({ ...pendingAction, action: "delete-final" });
      return;
    }

    void runAction(pendingAction);
  }

  if (!supabaseConfigured) {
    return (
      <div className="grid gap-6">
        <FeedbackMessage tone="warning">{SUPABASE_NOT_CONFIGURED_MESSAGE}</FeedbackMessage>
        <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-sm">
          <p className="font-semibold text-slate-950">Cadastros agora usam Supabase.</p>
          <p className="mt-2">
            Configure as variaveis e rode o schema antes de cadastrar lojas, marketplaces e transportadoras.
          </p>
          <p className="mt-2">
            O schema inicial continua responsavel pelos cadastros base.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {notice ? <FeedbackMessage tone={notice.tone}>{notice.text}</FeedbackMessage> : null}

      {loading ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-600 shadow-sm">
          Carregando cadastros...
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <CatalogSection
          title="Lojas"
          description="Use para separar a operacao, como Brasilia e Sao Paulo."
          placeholder="Nome da loja"
          items={catalogs.stores}
          disabled={loading}
          saving={saving}
          onAdd={(name) => handleCreate("stores", name)}
          onActivate={(item) => setPendingAction({ kind: "stores", item, action: "activate" })}
          onDeactivate={(item) => setPendingAction({ kind: "stores", item, action: "deactivate" })}
          onDelete={(item) => setPendingAction({ kind: "stores", item, action: "delete-first" })}
        />
        <CatalogSection
          title="Marketplaces"
          description="Canais de venda disponiveis na bipagem e nos filtros."
          placeholder="Nome do marketplace"
          items={catalogs.marketplaces}
          disabled={loading}
          saving={saving}
          onAdd={(name) => handleCreate("marketplaces", name)}
          onActivate={(item) => setPendingAction({ kind: "marketplaces", item, action: "activate" })}
          onDeactivate={(item) => setPendingAction({ kind: "marketplaces", item, action: "deactivate" })}
          onDelete={(item) => setPendingAction({ kind: "marketplaces", item, action: "delete-first" })}
        />
        <CatalogSection
          title="Transportadoras"
          description="Obrigatorias quando Melhor Envio estiver marcado como Sim."
          placeholder="Nome da transportadora"
          items={catalogs.carriers}
          disabled={loading}
          saving={saving}
          onAdd={(name) => handleCreate("carriers", name)}
          onActivate={(item) => setPendingAction({ kind: "carriers", item, action: "activate" })}
          onDeactivate={(item) => setPendingAction({ kind: "carriers", item, action: "deactivate" })}
          onDelete={(item) => setPendingAction({ kind: "carriers", item, action: "delete-first" })}
        />
        <ReportEmailSection
          items={catalogs.reportEmails}
          disabled={loading}
          saving={saving}
          onAdd={handleCreateReportEmail}
          onActivate={(item) =>
            setPendingAction({
              kind: "reportEmails",
              item: mapReportEmailToCatalogItem(item),
              action: "activate",
            })
          }
          onDeactivate={(item) =>
            setPendingAction({
              kind: "reportEmails",
              item: mapReportEmailToCatalogItem(item),
              action: "deactivate",
            })
          }
          onDelete={(item) =>
            setPendingAction({
              kind: "reportEmails",
              item: mapReportEmailToCatalogItem(item),
              action: "delete-first",
            })
          }
        />
      </div>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction ? getActionTitle(pendingAction.action) : ""}
        message={pendingAction ? getActionMessage(pendingAction) : ""}
        cancelLabel="Cancelar"
        confirmLabel={pendingAction ? getConfirmLabel(pendingAction.action) : "Confirmar"}
        tone={pendingAction?.action.startsWith("delete") ? "danger" : "neutral"}
        onCancel={() => setPendingAction(null)}
        onConfirm={confirmPendingAction}
      />
    </div>
  );
}
