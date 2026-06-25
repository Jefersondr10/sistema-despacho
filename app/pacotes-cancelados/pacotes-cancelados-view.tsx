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

export function PacotesCanceladosView() {
  const { catalogs, cancellations, loading, error } = useSupabaseDispatchData();
  const [filters, setFilters] = useState(createDefaultPackageFilters);
  const filteredCancellations = useMemo(
    () => filterCancellations(cancellations, filters),
    [cancellations, filters],
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
        onChange={setFilters}
      />

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-5 md:flex-row md:items-center md:justify-between">
          <div>
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
          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredCancellations.map((item) => (
              <article
                key={item.id}
                className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="break-all font-mono text-sm font-semibold text-slate-950">
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
                      Bipagem original:
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

                <div className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">
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
          </div>
        ) : (
          <div className="p-5">
            <EmptyState>Nenhum pacote cancelado encontrado.</EmptyState>
          </div>
        )}
      </section>
    </>
  );
}
