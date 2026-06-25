"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PackageFilters } from "@/app/_components/package-filters";
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
} from "@/app/_lib/mock-data";
import { useSupabaseDispatchData } from "@/app/_lib/supabase-dispatch-store";
import {
  formatDatabaseError,
  getRelatorioDestinatarios,
  validateEmailAddress,
  type RelatorioDestinatarioRow,
} from "@/lib/database";
import { getSupabaseClient } from "@/lib/supabaseClient";

type ReportMode = "resumido" | "detalhado" | "todos";

type Notice = {
  tone: "success" | "warning" | "danger" | "neutral";
  text: string;
};

function summarizeList(values: string[], allLabel: string) {
  return values.length ? values.join(", ") : allLabel;
}

function getFilterSummary(
  filters: ReturnType<typeof createDefaultPackageFilters>,
  stores: Store[],
) {
  return {
    loja: filters.lojaId.length
      ? filters.lojaId.map((lojaId) => getStoreName(lojaId, stores)).join(", ")
      : "Todas",
    data: describeDateFilter(filters),
    marketplace: summarizeList(filters.marketplace, "Todos"),
    melhorEnvio:
      filters.melhorEnvio === "todos"
        ? "Todos"
        : filters.melhorEnvio === "sim"
          ? "Sim"
          : "Não",
    transportadora: filters.transportadora.length
      ? filters.transportadora
          .map((transportadora) =>
            transportadora === "sem-transportadora"
              ? "Sem transportadora"
              : transportadora,
          )
          .join(", ")
      : "Todas",
    tipoOperacao: getOperationLabel(filters.tipoOperacao),
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

export function RelatoriosView() {
  const { catalogs, packages, loading, error } = useSupabaseDispatchData();
  const [mode, setMode] = useState<ReportMode>("resumido");
  const [filters, setFilters] = useState(createDefaultPackageFilters);
  const [recipients, setRecipients] = useState<RelatorioDestinatarioRow[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(true);
  const [recipientsError, setRecipientsError] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [manualEmail, setManualEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendNotice, setSendNotice] = useState<Notice | null>(null);
  const filteredPackages = useMemo(
    () => filterPackages(packages, filters),
    [packages, filters],
  );
  const summary = getReportSummary(filteredPackages, catalogs.stores);
  const filterSummary = getFilterSummary(filters, catalogs.stores);
  const allRecipientIds = useMemo(
    () => recipients.map((item) => item.id),
    [recipients],
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
    setRecipientsLoading(true);
    setRecipientsError("");

    try {
      const rows = await getRelatorioDestinatarios();
      setRecipients(rows);
      setSelectedRecipientIds((current) =>
        current.filter((id) => rows.some((item) => item.id === id)),
      );
    } catch (loadError) {
      setRecipientsError(formatDatabaseError(loadError));
    } finally {
      setRecipientsLoading(false);
    }
  }, []);

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

    if (!selectedRecipientIds.length && !manualEmails.length) {
      setSendNotice({
        tone: "warning",
        text: "Selecione ao menos um destinatario para enviar o relatorio.",
      });
      return;
    }

    setSendingEmail(true);

    try {
      const { data } = await getSupabaseClient().auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        throw new Error("Sessao nao encontrada. Entre novamente no sistema.");
      }

      const response = await fetch("/api/relatorios/enviar-email", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          destinatarioIds: selectedRecipientIds,
          emailsManuais: manualEmails,
          assunto: "Relatório de Despacho",
          filtros: filters,
          filtrosResumo: filterSummary,
          relatorio: {
            modo: mode,
            totalPacotes: filteredPackages.length,
            resumo: summary,
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
        onChange={setFilters}
      />

      <section className="no-print rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Envio por e-mail
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Selecione destinatários ativos cadastrados para receber o relatório atual.
          </p>
        </div>

        <div className="grid gap-5 p-5">
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
                disabled={!recipients.length || recipientsLoading || sendingEmail}
                onClick={toggleAllRecipients}
                className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                {allRecipientsSelected ? "Limpar seleção" : "Selecionar todos"}
              </button>
            </div>

            {recipientsLoading ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                Carregando destinatários...
              </div>
            ) : recipients.length ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {recipients.map((item) => {
                  const checked = selectedRecipientIds.includes(item.id);

                  return (
                    <label
                      key={item.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
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
                        <span className="block truncate text-sm font-semibold text-slate-950">
                          {item.nome?.trim() || "Sem apelido"}
                        </span>
                        <span className="mt-1 block truncate text-sm text-slate-500">
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
              E-mail manual extra
            </span>
            <input
              type="text"
              value={manualEmail}
              onChange={(event) => setManualEmail(event.target.value)}
              disabled={sendingEmail}
              className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              placeholder="exemplo@email.com"
            />
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Selecionados: {selectedRecipientIds.length + manualEmailCount}
            </p>
            <button
              type="button"
              onClick={sendReportByEmail}
              disabled={sendingEmail || recipientsLoading}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {sendingEmail ? "Enviando..." : "Gerar e enviar por e-mail"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Tipo de relatório
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Resumo por Coleta/Postagem e marketplace.
            </p>
          </div>

          <div className="no-print flex flex-col gap-3 sm:flex-row">
            <div className="inline-grid grid-cols-3 rounded-lg border border-slate-200 bg-slate-50 p-1">
              {[
                { label: "Resumido", value: "resumido" },
                { label: "Detalhado", value: "detalhado" },
                { label: "Tudo", value: "todos" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMode(item.value as ReportMode)}
                  className={`min-h-10 rounded-md px-4 text-sm font-semibold transition ${
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
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Gerar PDF
            </button>
          </div>
        </div>

        <div className="print-report-header border-b border-slate-100 p-5">
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
              <span className="font-semibold text-slate-700">Marketplace:</span>{" "}
              {filterSummary.marketplace}
            </p>
            <p>
              <span className="font-semibold text-slate-700">Melhor Envio:</span>{" "}
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
          </div>
        </div>

        <div className="border-b border-slate-100 px-5 py-3 text-sm text-slate-500">
          Total geral: {filteredPackages.length} pacotes.
        </div>

        {summary.length ? (
          <div className="p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-950">
              Resumo agrupado
            </h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {summary.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-950">
                      {item.loja_nome}
                    </span>
                    <OperationBadge operation={item.tipo_operacao} />
                  </div>
                  <div className="space-y-2 text-sm text-slate-600">
                    <p>
                      Marketplace:{" "}
                      <span className="font-semibold text-slate-950">
                        {item.marketplace}
                      </span>
                    </p>
                    <p>
                      Operação:{" "}
                      <span className="font-semibold text-slate-950">
                        {getOperationLabel(item.tipo_operacao)}
                      </span>
                    </p>
                    <p>
                      Melhor Envio:{" "}
                      <span className="font-semibold text-slate-950">
                        {item.melhor_envio ? "Sim" : "Não"}
                      </span>
                    </p>
                    {item.melhor_envio ? (
                      <p>
                        Transportadora:{" "}
                        <span className="font-semibold text-slate-950">
                          {item.transportadora || "Não informada"}
                        </span>
                      </p>
                    ) : null}
                  </div>
                  <p className="mt-4 text-3xl font-semibold text-slate-950">
                    {item.packages} pacotes
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState>Nenhum dado para gerar o relatório.</EmptyState>
          </div>
        )}

        {mode !== "resumido" && filteredPackages.length ? (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[1220px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">ID</th>
                  <th className="px-5 py-3 font-semibold">Data bipagem</th>
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

        <div className="border-t border-slate-100 p-5 text-xs leading-5 text-slate-500">
          <Badge tone="neutral">PDF via navegador</Badge>
          <span className="ml-2">
            O botão Gerar PDF abre a impressão com os filtros aplicados.
          </span>
        </div>
      </section>
    </>
  );
}
