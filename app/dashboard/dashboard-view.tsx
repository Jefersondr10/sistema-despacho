"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PackageFilters } from "@/app/_components/package-filters";
import {
  Badge,
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
  PackageMovement,
  Store,
} from "@/app/_lib/mock-data";
import {
  createDefaultPackageFilters,
  filterPackages,
  formatPackageDate,
  getDashboardMetrics,
  getOperationLabel,
  getReportSummary,
  getStoreName,
} from "@/app/_lib/mock-data";
import {
  useCatalogs,
  useStoredMovements,
  useStoredPackages,
} from "@/app/_lib/local-store";

export function DashboardView({
  packages: initialPackages,
  cancellations: initialCancellations,
  movements,
  stores,
  marketplaces,
  carriers,
}: {
  packages: DispatchPackage[];
  cancellations: PackageCancellation[];
  movements: PackageMovement[];
  stores: Store[];
  marketplaces: Marketplace[];
  carriers: Carrier[];
}) {
  const catalogs = useCatalogs({ stores, marketplaces, carriers });
  const { packages } = useStoredPackages(initialPackages, initialCancellations);
  const { movements: storedMovements } = useStoredMovements(movements);
  const [filters, setFilters] = useState(createDefaultPackageFilters);
  const filteredPackages = useMemo(
    () => filterPackages(packages, filters),
    [packages, filters],
  );
  const metrics = getDashboardMetrics(filteredPackages);
  const summary = getReportSummary(filteredPackages).slice(0, 4);
  const recentPackages = filteredPackages.slice(0, 6);
  const latestMovements = storedMovements
    .filter((movement) =>
      filteredPackages.some((item) => item.id === movement.pacote_id),
    )
    .slice(0, 5);

  return (
    <>
      <PackageFilters
        filters={filters}
        stores={catalogs.stores}
        marketplaces={catalogs.marketplaces}
        carriers={catalogs.carriers}
        onChange={setFilters}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

      <section className="grid gap-4 md:grid-cols-2">
        {catalogs.stores.map((store) => {
          const storeTotal = filteredPackages.filter(
            (item) => item.loja_id === store.id,
          ).length;

          return (
            <div
              key={store.id}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    {store.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Pacotes desta loja dentro dos filtros.
                  </p>
                </div>
                <p className="text-3xl font-semibold text-slate-950">
                  {storeTotal}
                </p>
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Resumo operacional
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Coleta/Postagem + marketplace.
              </p>
            </div>
            <Link
              href="/bipagem"
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Nova bipagem
            </Link>
          </div>

          <div className="space-y-3">
            {summary.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-950">
                    {item.marketplace}
                  </p>
                  <p className="text-sm text-slate-500">
                    {getOperationLabel(item.tipo_operacao)}
                  </p>
                </div>
                <p className="text-2xl font-semibold text-slate-950">
                  {item.packages}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 p-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Últimos pacotes
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Sem misturar lojas: cada linha carrega seu loja_id.
              </p>
            </div>
            <Badge tone="neutral">{latestMovements.length} movimentações</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Data</th>
                  <th className="px-5 py-3 font-semibold">Loja</th>
                  <th className="px-5 py-3 font-semibold">Rastreio</th>
                  <th className="px-5 py-3 font-semibold">Melhor Envio</th>
                  <th className="px-5 py-3 font-semibold">Coleta/Postagem</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentPackages.map((item) => (
                  <tr key={item.id} className="align-middle">
                    <td className="px-5 py-4 text-slate-600">
                      {formatPackageDate(item.data_hora_bipagem)}
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-950">
                      {getStoreName(item.loja_id)}
                    </td>
                    <td className="px-5 py-4 font-mono text-sm text-slate-950">
                      {item.codigo_rastreio}
                    </td>
                    <td className="px-5 py-4">
                      <MelhorEnvioBadge active={item.melhor_envio} />
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
        </div>
      </section>
    </>
  );
}
