"use client";

import { useMemo, useState } from "react";

import { PackageFilters } from "@/app/_components/package-filters";
import {
  Badge,
  EmptyState,
  FeedbackMessage,
  MelhorEnvioBadge,
  OperationBadge,
  StatCard,
  StatusBadge,
} from "@/app/_components/ui";
import {
  createDefaultPackageFilters,
  filterPackages,
  formatPackageDate,
  getDashboardMetrics,
  getStoreName,
} from "@/app/_lib/mock-data";
import { useSupabaseDispatchData } from "@/app/_lib/supabase-dispatch-store";

const PACKAGE_PAGE_SIZE = 100;

export function PacotesView() {
  const { catalogs, packages, loading, error } =
    useSupabaseDispatchData("pacotes");
  const [filters, setFilters] = useState(createDefaultPackageFilters);
  const [visiblePackageCount, setVisiblePackageCount] = useState(
    PACKAGE_PAGE_SIZE,
  );
  const filteredPackages = useMemo(
    () => filterPackages(packages, filters),
    [packages, filters],
  );
  const visiblePackages = useMemo(
    () => filteredPackages.slice(0, visiblePackageCount),
    [filteredPackages, visiblePackageCount],
  );
  const metrics = useMemo(
    () => getDashboardMetrics(filteredPackages),
    [filteredPackages],
  );

  return (
    <>
      {loading ? (
        <FeedbackMessage tone="neutral">Carregando pacotes do Supabase...</FeedbackMessage>
      ) : null}

      {error ? <FeedbackMessage tone="danger">{error}</FeedbackMessage> : null}

      <PackageFilters
        filters={filters}
        stores={catalogs.stores}
        marketplaces={catalogs.marketplaces}
        carriers={catalogs.carriers}
        showSearch
        onChange={(nextFilters) => {
          setVisiblePackageCount(PACKAGE_PAGE_SIZE);
          setFilters(nextFilters);
        }}
      />

      <section className="app-card-grid gap-4">
        <StatCard
          label="Total filtrado"
          value={metrics.total}
          detail="Pacotes encontrados com os filtros atuais."
          tone="teal"
        />
        <StatCard
          label="Melhor Envio"
          value={metrics.melhorEnvio}
          detail="Pacotes que exigem transportadora."
          tone="blue"
        />
        <StatCard
          label="Pendentes"
          value={metrics.pending}
          detail="Pacotes sem status final."
          tone="amber"
        />
      </section>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-950">
              Todos os pacotes
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              A busca por rastreio respeita o filtro de loja selecionado.
            </p>
          </div>
          <Badge tone="neutral">{filteredPackages.length} registros</Badge>
        </div>

        {filteredPackages.length ? (
          <div className="app-card-grid gap-4 p-4 sm:p-6">
            {visiblePackages.map((item) => (
              <article
                key={item.id}
                className="group grid min-w-0 gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md hover:shadow-slate-900/5"
              >
                <div className="min-w-0">
                  <p className="break-all font-mono text-sm font-bold tracking-tight text-slate-950 transition group-hover:text-teal-800">
                    {item.codigo_rastreio}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-700">
                    {getStoreName(item.loja_id, catalogs.stores)}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {formatPackageDate(item.data_hora_bipagem)}
                  </p>
                </div>

                <div className="grid gap-2 text-sm text-slate-600">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="neutral">{item.marketplace}</Badge>
                    <OperationBadge operation={item.tipo_operacao} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <MelhorEnvioBadge active={item.melhor_envio} />
                    <StatusBadge status={item.status} />
                  </div>
                  <p>
                    <span className="font-semibold text-slate-700">
                      Transportadora:
                    </span>{" "}
                    {item.transportadora || "Sem transportadora"}
                  </p>
                </div>
              </article>
            ))}
            {visiblePackages.length < filteredPackages.length ? (
              <button
                type="button"
                onClick={() =>
                  setVisiblePackageCount((current) =>
                    Math.min(
                      current + PACKAGE_PAGE_SIZE,
                      filteredPackages.length,
                    ),
                  )
                }
                className="col-span-full inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
              >
                Mostrar mais pacotes ({visiblePackages.length} de{" "}
                {filteredPackages.length})
              </button>
            ) : null}
          </div>
        ) : (
          <div className="p-4 sm:p-6">
            <EmptyState>
              Nenhum pacote encontrado para os filtros e rastreio informados.
            </EmptyState>
          </div>
        )}
      </section>
    </>
  );
}
