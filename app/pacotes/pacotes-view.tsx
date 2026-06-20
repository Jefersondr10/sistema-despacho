"use client";

import { useMemo, useState } from "react";

import { PackageFilters } from "@/app/_components/package-filters";
import {
  Badge,
  EmptyState,
  MelhorEnvioBadge,
  OperationBadge,
  StatCard,
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
  filterPackages,
  formatPackageDate,
  getDashboardMetrics,
  getStoreName,
} from "@/app/_lib/mock-data";
import { useCatalogs, useStoredPackages } from "@/app/_lib/local-store";

export function PacotesView({
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
  const [filters, setFilters] = useState(createDefaultPackageFilters);
  const filteredPackages = useMemo(
    () => filterPackages(packages, filters),
    [packages, filters],
  );
  const metrics = getDashboardMetrics(filteredPackages);

  return (
    <>
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">ID</th>
                  <th className="px-5 py-3 font-semibold">Data bipagem</th>
                  <th className="px-5 py-3 font-semibold">Loja</th>
                  <th className="px-5 py-3 font-semibold">Rastreio</th>
                  <th className="px-5 py-3 font-semibold">Marketplace</th>
                  <th className="px-5 py-3 font-semibold">Melhor Envio</th>
                  <th className="px-5 py-3 font-semibold">Transportadora</th>
                  <th className="px-5 py-3 font-semibold">Coleta/Postagem</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
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
                    <td className="px-5 py-4 font-mono text-sm font-semibold text-slate-950">
                      {item.codigo_rastreio}
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
                    <td className="px-5 py-4">
                      <StatusBadge status={item.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
