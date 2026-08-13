"use client";

import { useMemo, useState } from "react";

import { PackageFilters } from "@/app/_components/package-filters";
import {
  Badge,
  EmptyState,
  FeedbackMessage,
  MelhorEnvioBadge,
  OperationBadge,
} from "@/app/_components/ui";
import {
  createDefaultPackageFilters,
  filterCancellations,
  formatPackageDate,
} from "@/app/_lib/mock-data";
import { useSupabaseDispatchData } from "@/app/_lib/supabase-dispatch-store";

const CANCELLATION_PAGE_SIZE = 100;

export function PacotesCanceladosView() {
  const { catalogs, cancellations, loading, error } =
    useSupabaseDispatchData("cancelados");
  const [filters, setFilters] = useState(createDefaultPackageFilters);
  const [visibleCancellationCount, setVisibleCancellationCount] = useState(
    CANCELLATION_PAGE_SIZE,
  );
  const filteredCancellations = useMemo(
    () => filterCancellations(cancellations, filters),
    [cancellations, filters],
  );
  const visibleCancellations = useMemo(
    () => filteredCancellations.slice(0, visibleCancellationCount),
    [filteredCancellations, visibleCancellationCount],
  );

  return (
    <>
      {loading ? (
        <FeedbackMessage tone="neutral">
          Carregando cancelamentos do Supabase...
        </FeedbackMessage>
      ) : null}

      {error ? <FeedbackMessage tone="danger">{error}</FeedbackMessage> : null}

      <PackageFilters
        filters={filters}
        stores={catalogs.stores}
        marketplaces={catalogs.marketplaces}
        carriers={catalogs.carriers}
        showSearch
        searchLabel="Buscar pacote cancelado"
        onChange={(nextFilters) => {
          setVisibleCancellationCount(CANCELLATION_PAGE_SIZE);
          setFilters(nextFilters);
        }}
      />

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-rose-50/35 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-950">
              Histórico de cancelamentos
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {filteredCancellations.length} cancelamentos encontrados.
            </p>
          </div>
          <Badge tone="red">Cancelados</Badge>
        </div>

        {filteredCancellations.length ? (
          <div className="app-card-grid gap-4 p-4 sm:p-6">
            {visibleCancellations.map((item) => (
              <article
                key={item.id}
                className="group grid min-w-0 gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md hover:shadow-slate-900/5"
              >
                <div className="min-w-0">
                  <p className="break-all font-mono text-sm font-bold tracking-tight text-slate-950 transition group-hover:text-rose-700">
                    {item.codigo_pacote}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-700">
                    {item.loja_nome}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge tone="neutral">{item.marketplace}</Badge>
                  <OperationBadge operation={item.tipo_operacao} />
                  <MelhorEnvioBadge active={item.melhor_envio} />
                </div>

                <div className="grid gap-2 text-sm text-slate-600">
                  <p>
                    <span className="font-semibold text-slate-700">
                      Transportadora:
                    </span>{" "}
                    {item.transportadora || "Sem transportadora"}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">
                      Bipado em:
                    </span>{" "}
                    {formatPackageDate(item.data_hora_bipagem)}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">
                      Cancelamento:
                    </span>{" "}
                    {formatPackageDate(item.cancelado_em)}
                  </p>
                </div>

                <div className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-sm text-slate-600">
                  <p>
                    <span className="font-semibold text-slate-700">
                      Justificativa geral:
                    </span>{" "}
                    {item.justificativa_geral}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">
                      Justificativa individual:
                    </span>{" "}
                    {item.justificativa_individual || "-"}
                  </p>
                </div>
              </article>
            ))}
            {visibleCancellations.length < filteredCancellations.length ? (
              <button
                type="button"
                onClick={() =>
                  setVisibleCancellationCount((current) =>
                    Math.min(
                      current + CANCELLATION_PAGE_SIZE,
                      filteredCancellations.length,
                    ),
                  )
                }
                className="col-span-full inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
              >
                Mostrar mais cancelamentos ({visibleCancellations.length} de{" "}
                {filteredCancellations.length})
              </button>
            ) : null}
          </div>
        ) : (
          <div className="p-4 sm:p-6">
            <EmptyState>Nenhum pacote cancelado encontrado.</EmptyState>
          </div>
        )}
      </section>
    </>
  );
}
