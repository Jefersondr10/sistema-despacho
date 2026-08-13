"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PackageFilters } from "@/app/_components/package-filters";
import {
  Badge,
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
  getReportSummary,
  getStoreName,
} from "@/app/_lib/mock-data";
import { useSupabaseDispatchData } from "@/app/_lib/supabase-dispatch-store";

export function DashboardView() {
  const { catalogs, packages, movements: storedMovements, loading, error } =
    useSupabaseDispatchData("dashboard");
  const [filters, setFilters] = useState(createDefaultPackageFilters);
  const filteredPackages = useMemo(
    () => filterPackages(packages, filters),
    [packages, filters],
  );
  const metrics = getDashboardMetrics(filteredPackages);
  const summary = getReportSummary(filteredPackages, catalogs.stores).slice(0, 4);
  const recentPackages = filteredPackages.slice(0, 6);
  const latestMovements = storedMovements
    .filter((movement) =>
      filteredPackages.some((item) => item.id === movement.pacote_id),
    )
    .slice(0, 5);

  return (
    <>
      {loading ? (
        <FeedbackMessage tone="neutral">Carregando dados do Supabase...</FeedbackMessage>
      ) : null}

      {error ? <FeedbackMessage tone="danger">{error}</FeedbackMessage> : null}

      <PackageFilters
        filters={filters}
        stores={catalogs.stores}
        marketplaces={catalogs.marketplaces}
        carriers={catalogs.carriers}
        onChange={setFilters}
      />

      <section className="app-card-grid gap-4">
        <StatCard
          label="Pacotes"
          value={metrics.total}
          detail="Pacotes dentro dos filtros selecionados."
          tone="teal"
        />
        <StatCard
          label="Melhor Envio"
          value={metrics.melhorEnvio}
          detail="Pacotes marcados com Melhor Envio."
          tone="blue"
        />
        <StatCard
          label="Coletas"
          value={metrics.coletas}
          detail="Pacotes com operação de coleta."
          tone="amber"
        />
        <StatCard
          label="Postagens"
          value={metrics.postagens}
          detail="Pacotes com operação de postagem."
          tone="slate"
        />
      </section>

      <section className="app-card-grid gap-4">
        {catalogs.stores.map((store) => {
          const storeTotal = filteredPackages.filter(
            (item) => item.loja_id === store.id,
          ).length;

          return (
            <div
              key={store.id}
              className="group min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-lg hover:shadow-slate-900/5 sm:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-slate-950">
                    {store.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Pacotes desta loja dentro dos filtros.
                  </p>
                </div>
                <p className="shrink-0 rounded-xl bg-teal-50 px-3 py-2 text-2xl font-bold tracking-tight text-teal-800 transition group-hover:bg-teal-100 sm:px-4 sm:text-3xl">
                  {storeTotal}
                </p>
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid min-w-0 gap-5 2xl:grid-cols-[0.9fr_1.1fr] 2xl:gap-6">
        <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-950">
                Resumo operacional
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Coleta/Postagem + marketplace.
              </p>
            </div>
            <Link
              href="/bipagem"
              className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-800 hover:shadow-md sm:w-auto"
            >
              Bipar pacotes
            </Link>
          </div>

          <div className="space-y-3">
            {summary.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-4 rounded-xl border border-slate-200/80 bg-slate-50/40 px-4 py-3.5 transition hover:border-teal-200 hover:bg-teal-50/30 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="break-words font-medium text-slate-950">
                    {item.marketplace}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <OperationBadge operation={item.tipo_operacao} />
                    <MelhorEnvioBadge active={item.melhor_envio} />
                  </div>
                  {item.melhor_envio ? (
                    <p className="mt-2 text-sm text-slate-500">
                      {item.transportadora || "Não informada"}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 sm:text-right">
                  <p className="text-2xl font-bold tracking-tight text-slate-950">
                    {item.packages}
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    pacotes
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-950">
                Últimos pacotes
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Sem misturar lojas: cada linha carrega seu loja_id.
              </p>
            </div>
            <Badge tone="neutral">{latestMovements.length} movimentações</Badge>
          </div>

          <div className="app-card-grid gap-3 p-4 sm:p-6">
            {recentPackages.map((item) => (
              <article
                key={item.id}
                className="grid gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
              >
                <div className="min-w-0">
                  <p className="break-all font-mono text-sm font-semibold text-slate-950">
                    {item.codigo_rastreio}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-700">
                    {getStoreName(item.loja_id, catalogs.stores)}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {formatPackageDate(item.data_hora_bipagem)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <MelhorEnvioBadge active={item.melhor_envio} />
                  <OperationBadge operation={item.tipo_operacao} />
                  <StatusBadge status={item.status} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
