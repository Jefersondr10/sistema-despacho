"use client";

import { useMemo, useState } from "react";

import { PackageFilters } from "@/app/_components/package-filters";
import {
  Badge,
  EmptyState,
  MelhorEnvioBadge,
  OperationBadge,
  StatusBadge,
} from "@/app/_components/ui";
import type {
  Carrier,
  DispatchPackage,
  Marketplace,
  PackageCancellation,
  Store,
} from "@/app/_lib/mock-data";
import {
  createDefaultPackageFilters,
  describeDateFilter,
  filterPackages,
  formatPackageDate,
  getOperationLabel,
  getReportSummary,
  getStoreName,
} from "@/app/_lib/mock-data";
import { useCatalogs, useStoredPackages } from "@/app/_lib/local-store";

type ReportMode = "resumido" | "detalhado" | "todos";

function summarizeList(values: string[], allLabel: string) {
  return values.length ? values.join(", ") : allLabel;
}

function getFilterSummary(
  filters: ReturnType<typeof createDefaultPackageFilters>,
) {
  return {
    loja: filters.lojaId.length
      ? filters.lojaId.map((lojaId) => getStoreName(lojaId)).join(", ")
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

export function RelatoriosView({
  packages: initialPackages,
  cancellations: initialCancellations,
  stores,
  marketplaces,
  carriers,
}: {
  packages: DispatchPackage[];
  cancellations: PackageCancellation[];
  stores: Store[];
  marketplaces: Marketplace[];
  carriers: Carrier[];
}) {
  const catalogs = useCatalogs({ stores, marketplaces, carriers });
  const { packages } = useStoredPackages(initialPackages, initialCancellations);
  const [mode, setMode] = useState<ReportMode>("resumido");
  const [filters, setFilters] = useState(createDefaultPackageFilters);
  const filteredPackages = useMemo(
    () => filterPackages(packages, filters),
    [packages, filters],
  );
  const summary = getReportSummary(filteredPackages);
  const filterSummary = getFilterSummary(filters);

  function generatePdf() {
    window.print();
  }

  return (
    <>
      <PackageFilters
        filters={filters}
        stores={catalogs.stores}
        marketplaces={catalogs.marketplaces}
        carriers={catalogs.carriers}
        chipControls
        onChange={setFilters}
      />

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
                      {getStoreName(item.loja_id)}
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
