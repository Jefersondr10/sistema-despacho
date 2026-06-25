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

export function PacotesView() {
  const { catalogs, packages, loading, error } = useSupabaseDispatchData();
  const [filters, setFilters] = useState(createDefaultPackageFilters);
  const filteredPackages = useMemo(
    () => filterPackages(packages, filters),
    [packages, filters],
  );
  const metrics = getDashboardMetrics(filteredPackages);

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
        onChange={setFilters}
      />

      <section className="grid gap-4 md:grid-cols-3">
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

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-5 md:flex-row md:items-center md:justify-between">
          <div>
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
          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredPackages.map((item) => (
              <article
                key={item.id}
                className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
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
          </div>
        ) : (
          <div className="p-5">
            <EmptyState>
              Nenhum pacote encontrado para os filtros e rastreio informados.
            </EmptyState>
          </div>
        )}
      </section>
    </>
  );
}
