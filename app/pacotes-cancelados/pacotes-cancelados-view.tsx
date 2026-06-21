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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1320px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Rastreio</th>
                  <th className="px-5 py-3 font-semibold">Loja</th>
                  <th className="px-5 py-3 font-semibold">Marketplace</th>
                  <th className="px-5 py-3 font-semibold">Coleta/Postagem</th>
                  <th className="px-5 py-3 font-semibold">Melhor Envio</th>
                  <th className="px-5 py-3 font-semibold">Transportadora</th>
                  <th className="px-5 py-3 font-semibold">Bipagem original</th>
                  <th className="px-5 py-3 font-semibold">Cancelamento</th>
                  <th className="px-5 py-3 font-semibold">Justificativa geral</th>
                  <th className="px-5 py-3 font-semibold">
                    Justificativa individual
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCancellations.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="px-5 py-4 font-mono text-sm font-semibold text-slate-950">
                      {item.codigo_pacote}
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-950">
                      {item.loja_nome}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {item.marketplace}
                    </td>
                    <td className="px-5 py-4">
                      <OperationBadge operation={item.tipo_operacao} />
                    </td>
                    <td className="px-5 py-4">
                      <MelhorEnvioBadge active={item.melhor_envio} />
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {item.transportadora || "Sem transportadora"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatPackageDate(item.data_hora_bipagem)}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatPackageDate(item.cancelado_em)}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {item.justificativa_geral}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {item.justificativa_individual || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
