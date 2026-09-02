"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PackageFilters } from "@/app/_components/package-filters";
import { RomaneioDocument } from "@/app/_components/romaneio-document";
import {
  Badge,
  EmptyState,
  FeedbackMessage,
  MelhorEnvioBadge,
  OperationBadge,
  StatusBadge,
} from "@/app/_components/ui";
import type { Store } from "@/app/_lib/mock-data";
import {
  createDefaultPackageFilters,
  describeDateFilter,
  filterPackages,
  formatPackageDate,
  getOperationLabel,
  getReportSummary,
  getStoreName,
  hasEmptyMultiSelection,
} from "@/app/_lib/mock-data";
import {
  groupRomaneioPackagesByStoreAndMarketplace,
  type RomaneioGroup,
} from "@/app/_lib/romaneio";
import { useSupabaseDispatchData } from "@/app/_lib/supabase-dispatch-store";
import { useAuth } from "@/app/_lib/auth-context";
import { useTeam } from "@/app/_lib/team-context";
import { hasTeamPermission } from "@/app/equipe/team-contract";
import {
  formatDatabaseError,
  getRelatorioDestinatarios,
  validateEmailAddress,
  type RelatorioDestinatarioRow,
} from "@/lib/database";

type ReportMode = "resumido" | "detalhado" | "todos" | "romaneio";

type Notice = {
  tone: "success" | "warning" | "danger" | "neutral";
  text: string;
};

function summarizeList(
  values: string[],
  allLabel: string,
  emptyLabel: string,
  explicitlyEmpty: boolean,
) {
  if (explicitlyEmpty) {
    return emptyLabel;
  }

  return values.length
    ? values.map((value) => value.trim() || "Não informado").join(", ")
    : allLabel;
}

function getFilterSummary(
  filters: ReturnType<typeof createDefaultPackageFilters>,
  stores: Store[],
) {
  return {
    loja: hasEmptyMultiSelection(filters, "lojaId")
      ? "Nenhuma"
      : filters.lojaId.length
        ? filters.lojaId
            .map((lojaId) => getStoreName(lojaId, stores))
            .join(", ")
        : "Todas",
    data: describeDateFilter(filters),
    marketplace: summarizeList(
      filters.marketplace,
      "Todos",
      "Nenhum",
      hasEmptyMultiSelection(filters, "marketplace"),
    ),
    melhorEnvio:
      filters.melhorEnvio === "todos"
        ? "Todos"
        : filters.melhorEnvio === "sim"
          ? "Sim"
          : "Não",
    transportadora: hasEmptyMultiSelection(filters, "transportadora")
      ? "Nenhuma"
      : filters.transportadora.length
        ? filters.transportadora
            .map((transportadora) =>
              transportadora === "sem-transportadora"
                ? "Sem transportadora"
                : transportadora,
            )
            .join(", ")
        : "Todas",
    tipoOperacao: getOperationLabel(filters.tipoOperacao),
    codigoLote: filters.codigoLote?.trim() || "Todos",
  };
}

function parseManualEmails(value: string) {
  if (!value.trim()) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map((email) => email.trim())
        .filter(Boolean)
        .map((email) => validateEmailAddress(email)),
    ),
  );
}

export function RelatoriosView({
  initialMode = "resumido",
  initialStoreId,
  initialMarketplace,
  initialMarketplaceId,
  initialDate,
}: {
  initialMode?: ReportMode;
  initialStoreId?: string;
  initialMarketplace?: string;
  initialMarketplaceId?: string;
  initialDate?: string;
}) {
  const { session, user } = useAuth();
  const { context: teamContext } = useTeam();
  const canSendReports = hasTeamPermission(teamContext, "relatorios.send");
  const loadRecipientsRequestIdRef = useRef(0);
  const { catalogs, packages, loading, error } =
    useSupabaseDispatchData("relatorios");
  const [mode, setMode] = useState<ReportMode>(initialMode);
  const [filters, setFilters] = useState<
    ReturnType<typeof createDefaultPackageFilters>
  >(() => {
    const defaults = createDefaultPackageFilters();

    return {
      ...defaults,
      lojaId: initialStoreId ? [initialStoreId] : defaults.lojaId,
      marketplaceId: initialMarketplaceId,
      marketplace: initialMarketplace !== undefined
        ? [initialMarketplace]
        : defaults.marketplace,
      ...(initialDate
        ? {
            dateMode: "single" as const,
            selectedDate: initialDate,
            startDate: initialDate,
            endDate: initialDate,
          }
        : {}),
    };
  });
  const [recipients, setRecipients] = useState<RelatorioDestinatarioRow[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(true);
  const [recipientsError, setRecipientsError] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [manualEmail, setManualEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendNotice, setSendNotice] = useState<Notice | null>(null);
  const effectiveFilters = useMemo(
    () => (mode === "romaneio" ? { ...filters, codigoLote: "" } : filters),
    [filters, mode],
  );
  const filteredPackages = useMemo(
    () => filterPackages(packages, effectiveFilters),
    [packages, effectiveFilters],
  );
  const databaseContext = useMemo(
    () => ({ userId: user?.id }),
    [user?.id],
  );
  const summary = useMemo(
    () => getReportSummary(filteredPackages, catalogs.stores),
    [catalogs.stores, filteredPackages],
  );
  const filterSummary = useMemo(
    () => getFilterSummary(effectiveFilters, catalogs.stores),
    [catalogs.stores, effectiveFilters],
  );
  const romaneioGroups = useMemo<RomaneioGroup[]>(
    () =>
      groupRomaneioPackagesByStoreAndMarketplace(
        filteredPackages,
        catalogs.stores,
        filterSummary.data,
      ),
    [catalogs.stores, filterSummary.data, filteredPackages],
  );
  const visibleRecipients = recipients;
  const recipientsLoadingView = recipientsLoading;
  const allRecipientIds = useMemo(
    () => visibleRecipients.map((item) => item.id),
    [visibleRecipients],
  );
  const visibleSelectedRecipientIds = useMemo(
    () => selectedRecipientIds.filter((id) => allRecipientIds.includes(id)),
    [allRecipientIds, selectedRecipientIds],
  );
  const manualEmailCount = useMemo(() => {
    try {
      return parseManualEmails(manualEmail).length;
    } catch {
      return 0;
    }
  }, [manualEmail]);
  const allRecipientsSelected =
    Boolean(allRecipientIds.length) &&
    allRecipientIds.every((id) => selectedRecipientIds.includes(id));

  const loadRecipients = useCallback(async () => {
    const requestId = ++loadRecipientsRequestIdRef.current;
    const isCurrentRequest = () =>
      requestId === loadRecipientsRequestIdRef.current;

    if (!canSendReports) {
      setRecipients([]);
      setSelectedRecipientIds([]);
      setRecipientsError("");
      setRecipientsLoading(false);
      return;
    }

    setRecipientsLoading(true);
    setRecipientsError("");

    try {
      const rows = await getRelatorioDestinatarios(
        undefined,
        databaseContext,
      );
      if (!isCurrentRequest()) {
        return;
      }

      setRecipients(rows);
      setSelectedRecipientIds((current) =>
        current.filter((id) => rows.some((item) => item.id === id)),
      );
    } catch (loadError) {
      if (!isCurrentRequest()) {
        return;
      }

      setRecipientsError(formatDatabaseError(loadError));
    } finally {
      if (isCurrentRequest()) {
        setRecipientsLoading(false);
      }
    }
  }, [canSendReports, databaseContext]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        void loadRecipients();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadRecipients]);

  function generatePdf() {
    window.print();
  }

  function toggleRecipient(id: string) {
    setSelectedRecipientIds((current) =>
      current.includes(id)
        ? current.filter((currentId) => currentId !== id)
        : [...current, id],
    );
  }

  function toggleAllRecipients() {
    setSelectedRecipientIds(allRecipientsSelected ? [] : allRecipientIds);
  }

  async function sendReportByEmail() {
    setSendNotice(null);

    if (!canSendReports) {
      setSendNotice({
        tone: "warning",
        text: "Seu acesso não permite enviar relatórios por e-mail.",
      });
      return;
    }

    let manualEmails: string[];
    try {
      manualEmails = parseManualEmails(manualEmail);
    } catch (validationError) {
      setSendNotice({
        tone: "warning",
        text: formatDatabaseError(validationError),
      });
      return;
    }

    if (!visibleSelectedRecipientIds.length && !manualEmails.length) {
      setSendNotice({
        tone: "warning",
        text: "Selecione ao menos um destinatario para enviar o relatorio.",
      });
      return;
    }

    setSendingEmail(true);

    try {
      const response = await fetch("/api/relatorios/enviar-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          destinatarioIds: visibleSelectedRecipientIds,
          emailsManuais: manualEmails,
          assunto:
            mode === "romaneio"
              ? "Romaneio de Pacotes"
              : "Relatório de Despacho",
          filtros: effectiveFilters,
          filtrosResumo: filterSummary,
          relatorio: {
            modo: mode,
            totalPacotes: filteredPackages.length,
            resumo: summary,
            romaneios: romaneioGroups.map((group) => ({
              id: group.id,
              loja_id: group.loja_id,
              loja_nome: group.loja_nome,
              marketplace_id: group.marketplace_id,
              marketplace: group.marketplace,
              periodo: group.periodo,
              pacotes: group.pacotes.map((item) => ({
                codigo_rastreio: item.codigo_rastreio,
              })),
            })),
          },
        }),
      });

      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        totalDestinatarios?: number;
      } | null;

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || "Nao foi possivel enviar o relatorio.");
      }

      setSendNotice({
        tone: "success",
        text: `Relatorio enviado para ${result.totalDestinatarios ?? 0} destinatario(s).`,
      });
    } catch (sendError) {
      setSendNotice({
        tone: "danger",
        text: formatDatabaseError(sendError),
      });
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <>
      {loading ? (
        <FeedbackMessage tone="neutral">Carregando relatórios do Supabase...</FeedbackMessage>
      ) : null}

      {error ? <FeedbackMessage tone="danger">{error}</FeedbackMessage> : null}

      <PackageFilters
        filters={filters}
        stores={catalogs.stores}
        marketplaces={catalogs.marketplaces}
        carriers={catalogs.carriers}
        chipControls
        showBatchCodeSearch={mode !== "romaneio"}
        onChange={setFilters}
      />

      {canSendReports ? (
      <section className="no-print min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-900/5">
        <div className="border-b border-slate-200 bg-gradient-to-r from-teal-50/80 to-white p-4 sm:p-6">
          <h2 className="text-lg font-bold text-slate-950">
            Envio por e-mail
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Selecione destinatários ativos cadastrados para receber o relatório atual.
          </p>
        </div>

        <div className="grid min-w-0 gap-5 p-4 sm:p-6">
          {sendNotice ? (
            <FeedbackMessage tone={sendNotice.tone}>{sendNotice.text}</FeedbackMessage>
          ) : null}

          {recipientsError ? (
            <FeedbackMessage tone="danger">
              Erro ao carregar destinatários: {recipientsError}
            </FeedbackMessage>
          ) : null}

          <div>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-semibold text-slate-950">
                Destinatários cadastrados
              </h3>
              <button
                type="button"
                disabled={
                  !visibleRecipients.length || recipientsLoadingView || sendingEmail
                }
                onClick={toggleAllRecipients}
                className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 sm:w-auto"
              >
                {allRecipientsSelected ? "Limpar seleção" : "Selecionar todos"}
              </button>
            </div>

            {recipientsLoadingView ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                Carregando destinatários...
              </div>
            ) : visibleRecipients.length ? (
              <div className="app-card-grid gap-2">
                {visibleRecipients.map((item) => {
                  const checked = selectedRecipientIds.includes(item.id);

                  return (
                    <label
                      key={item.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                        checked
                          ? "border-teal-300 bg-teal-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={sendingEmail}
                        onChange={() => toggleRecipient(item.id)}
                        className="mt-1 size-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                      />
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-semibold text-slate-950">
                          {item.nome?.trim() || "Sem apelido"}
                        </span>
                        <span className="mt-1 block break-all text-sm text-slate-500">
                          {item.email}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <EmptyState>
                Nenhum destinatário ativo cadastrado. Cadastre em Cadastros &gt; E-mails de Relatório.
              </EmptyState>
            )}
          </div>

          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              E-mails manuais extras
            </span>
            <input
              type="text"
              value={manualEmail}
              onChange={(event) => setManualEmail(event.target.value)}
              disabled={sendingEmail}
              className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              placeholder="financeiro@email.com; gestor@email.com"
            />
            <span className="text-xs text-slate-500">
              Separe vários endereços por vírgula, ponto e vírgula ou espaço.
            </span>
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Selecionados: {visibleSelectedRecipientIds.length + manualEmailCount}
            </p>
            <button
              type="button"
              onClick={sendReportByEmail}
              disabled={sendingEmail || recipientsLoadingView}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-teal-700 px-5 text-sm font-bold text-white shadow-lg shadow-teal-900/15 transition hover:-translate-y-0.5 hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {sendingEmail ? "Enviando..." : "Gerar e enviar por e-mail"}
            </button>
          </div>
        </div>
      </section>
      ) : null}

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-900/5 print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
        <div className="no-print flex flex-col gap-4 border-b border-slate-200 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-950">
              Tipo de relatório
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Resumo por Coleta/Postagem e marketplace.
            </p>
          </div>

          <div className="no-print flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
            <div className="grid min-w-0 grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1 sm:grid-cols-4">
              {[
                { label: "Resumido", value: "resumido" },
                { label: "Detalhado", value: "detalhado" },
                { label: "Tudo", value: "todos" },
                { label: "Romaneio", value: "romaneio" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMode(item.value as ReportMode)}
                  className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition ${
                    mode === item.value
                      ? "bg-white text-teal-800 shadow-sm"
                      : "text-slate-600 hover:text-slate-950"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={generatePdf}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              {mode === "romaneio" ? "Imprimir" : "Gerar PDF"}
            </button>
          </div>
        </div>

        {mode !== "romaneio" ? (
          <>
            <div className="print-report-header border-b border-slate-100 p-4 sm:p-5">
              <h2 className="text-xl font-semibold text-slate-950">
                Relatório de Despacho
              </h2>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                <p>
                  <span className="font-semibold text-slate-700">Loja:</span>{" "}
                  {filterSummary.loja}
                </p>
                <p>
                  <span className="font-semibold text-slate-700">Data:</span>{" "}
                  {filterSummary.data}
                </p>
                <p>
                  <span className="font-semibold text-slate-700">
                    Marketplace:
                  </span>{" "}
                  {filterSummary.marketplace}
                </p>
                <p>
                  <span className="font-semibold text-slate-700">
                    Melhor Envio:
                  </span>{" "}
                  {filterSummary.melhorEnvio}
                </p>
                <p>
                  <span className="font-semibold text-slate-700">
                    Transportadora:
                  </span>{" "}
                  {filterSummary.transportadora}
                </p>
                <p>
                  <span className="font-semibold text-slate-700">
                    Coleta/Postagem:
                  </span>{" "}
                  {filterSummary.tipoOperacao}
                </p>
                <p>
                  <span className="font-semibold text-slate-700">
                    Código do lote:
                  </span>{" "}
                  {filterSummary.codigoLote}
                </p>
              </div>
            </div>

            <div className="border-b border-slate-100 px-5 py-3 text-sm text-slate-500">
              Total geral: {filteredPackages.length} pacotes.
            </div>
          </>
        ) : null}

        {mode === "romaneio" ? (
          <div className="p-5 print:p-0">
            {romaneioGroups.length ? (
              <RomaneioDocument
                groups={romaneioGroups}
                totalLabel="Cada combinação de loja e marketplace em uma folha separada"
              />
            ) : (
              <EmptyState>Nenhum pacote para gerar romaneio.</EmptyState>
            )}
          </div>
        ) : summary.length ? (
          <div className="p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-950">
              Resumo agrupado
            </h3>
            <div className="app-card-grid gap-4">
              {summary.map((item) => (
                <article
                  key={item.id}
                  className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/5"
                >
                  <div className="min-w-0">
                    <p className="break-words text-base font-semibold text-slate-950">
                      {item.marketplace}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <OperationBadge operation={item.tipo_operacao} />
                      <MelhorEnvioBadge active={item.melhor_envio} />
                    </div>
                    {item.melhor_envio ? (
                      <p className="mt-3 text-sm text-slate-600">
                        <span className="font-semibold text-slate-700">
                          Transportadora:
                        </span>{" "}
                        {item.transportadora || "Não informada"}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-3xl font-semibold text-slate-950">
                      {item.packages} pacotes
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Total do agrupamento
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Por loja
                    </p>
                    <div className="mt-3 grid gap-2">
                      {item.lojas.map((loja) => (
                        <div
                          key={loja.loja_id}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="min-w-0 break-words text-slate-600">
                            {loja.loja_nome}
                          </span>
                          <span className="shrink-0 font-semibold text-slate-950">
                            {loja.packages}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState>Nenhum dado para gerar o relatório.</EmptyState>
          </div>
        )}

        {mode !== "resumido" && mode !== "romaneio" && filteredPackages.length ? (
          <div className="app-scroll-region-x border-t border-slate-100">
            <table className="w-full min-w-[1220px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">ID</th>
                  <th className="px-5 py-3 font-semibold">Bipado em</th>
                  <th className="px-5 py-3 font-semibold">Loja</th>
                  <th className="px-5 py-3 font-semibold">Marketplace</th>
                  <th className="px-5 py-3 font-semibold">Melhor Envio</th>
                  <th className="px-5 py-3 font-semibold">Transportadora</th>
                  <th className="px-5 py-3 font-semibold">Coleta/Postagem</th>
                  <th className="px-5 py-3 font-semibold">Código/rastreio</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Criado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPackages.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-4 font-mono text-xs text-slate-500">
                      {item.id}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatPackageDate(item.data_hora_bipagem)}
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-950">
                      {getStoreName(item.loja_id, catalogs.stores)}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {item.marketplace}
                    </td>
                    <td className="px-5 py-4">
                      <MelhorEnvioBadge active={item.melhor_envio} />
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {item.transportadora || "Sem transportadora"}
                    </td>
                    <td className="px-5 py-4">
                      <OperationBadge operation={item.tipo_operacao} />
                    </td>
                    <td className="px-5 py-4 font-mono text-sm text-slate-950">
                      {item.codigo_rastreio}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatPackageDate(item.criado_em)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {mode !== "romaneio" ? (
          <div className="no-print border-t border-slate-100 p-5 text-xs leading-5 text-slate-500">
            <Badge tone="neutral">PDF via navegador</Badge>
            <span className="ml-2">
              O botão Gerar PDF abre a impressão com os filtros aplicados.
            </span>
          </div>
        ) : null}
      </section>
    </>
  );
}
