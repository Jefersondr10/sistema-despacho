"use client";

import { useEffect } from "react";

import { EmptyState, FeedbackMessage } from "@/app/_components/ui";
import {
  getSaoPauloDateString,
  getStoreName,
} from "@/app/_lib/mock-data";
import { useSupabaseDispatchData } from "@/app/_lib/supabase-dispatch-store";

function getStoreRomaneioUrl(batch: {
  loja_id: string;
  finalizado_em: string | null;
  criado_em: string;
}) {
  const params = new URLSearchParams({
    modo: "romaneio",
    lojaId: batch.loja_id,
    data: getSaoPauloDateString(batch.finalizado_em ?? batch.criado_em),
  });

  return `/relatorios?${params.toString()}`;
}

export function RomaneioLoteView({ loteId }: { loteId: string }) {
  const { catalogs, batches, loading, error } =
    useSupabaseDispatchData("romaneio", loteId);
  const batch = batches.find((item) => item.id === loteId);
  const destinationUrl = batch ? getStoreRomaneioUrl(batch) : "";

  useEffect(() => {
    if (destinationUrl) {
      window.location.replace(destinationUrl);
    }
  }, [destinationUrl]);

  return (
    <section className="mx-auto grid w-full max-w-[720px] gap-3">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-950">
          Romaneio por loja
        </h1>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          {batch
            ? `Abrindo os pacotes da loja ${getStoreName(
                batch.loja_id,
                catalogs.stores,
              )} no dia deste lote.`
            : "Localizando a loja vinculada ao lote antigo."}
        </p>
      </div>

      {loading ? (
        <FeedbackMessage tone="neutral">
          Carregando dados do lote...
        </FeedbackMessage>
      ) : null}

      {error ? <FeedbackMessage tone="danger">{error}</FeedbackMessage> : null}

      {!loading && !batch && !error ? (
        <EmptyState>Lote não encontrado.</EmptyState>
      ) : null}

      {destinationUrl ? (
        <a
          href={destinationUrl}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Continuar para o romaneio da loja
        </a>
      ) : null}
    </section>
  );
}
