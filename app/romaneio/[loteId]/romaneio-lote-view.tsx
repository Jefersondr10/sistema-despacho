"use client";

import {
  RomaneioDocument,
  type RomaneioGroup,
} from "@/app/_components/romaneio-document";
import { Badge, EmptyState, FeedbackMessage } from "@/app/_components/ui";
import { formatPackageDate, getStoreName } from "@/app/_lib/mock-data";
import { useSupabaseDispatchData } from "@/app/_lib/supabase-dispatch-store";

function getBatchCode(batch: { id: string; codigo_lote?: string | null }) {
  return batch.codigo_lote || `LOTE-${batch.id.slice(0, 8).toUpperCase()}`;
}

export function RomaneioLoteView({ loteId }: { loteId: string }) {
  const { catalogs, allPackages, batches, loading, error } =
    useSupabaseDispatchData("romaneio", loteId);
  const batch = batches.find((item) => item.id === loteId);
  const packages = allPackages.filter(
    (item) => item.lote_id === loteId && item.status !== "Cancelado",
  );

  const group: RomaneioGroup | null = batch
    ? {
        id: batch.id,
        codigo_lote: getBatchCode(batch),
        loja_nome: getStoreName(batch.loja_id, catalogs.stores),
        marketplace: batch.marketplace,
        tipo_operacao: batch.tipo_operacao,
        melhor_envio: batch.melhor_envio,
        transportadora: batch.transportadora,
        data: batch.finalizado_em ?? batch.criado_em,
        pacotes: packages,
      }
    : null;

  return (
    <section className="mx-auto grid w-full max-w-[1120px] gap-3">
      <div className="no-print flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">
            Romaneio por lote
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            {batch
              ? `${getBatchCode(batch)} - ${formatPackageDate(
                  batch.finalizado_em ?? batch.criado_em,
                )}`
              : "Carregando lote selecionado."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!group || loading}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Imprimir
        </button>
      </div>

      {loading ? (
        <FeedbackMessage tone="neutral">Carregando dados do lote...</FeedbackMessage>
      ) : null}

      {error ? <FeedbackMessage tone="danger">{error}</FeedbackMessage> : null}

      {!loading && !batch ? (
        <EmptyState>Lote nao encontrado.</EmptyState>
      ) : null}

      {group ? (
        packages.length ? (
          <RomaneioDocument groups={[group]} />
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <Badge tone="neutral">{group.codigo_lote}</Badge>
            <div className="mt-4">
              <EmptyState>Nenhum pacote encontrado para este lote.</EmptyState>
            </div>
          </div>
        )
      ) : null}
    </section>
  );
}
