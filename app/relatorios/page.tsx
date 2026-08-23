import { PageHeader } from "@/app/_components/ui";

import { RelatoriosView } from "./relatorios-view";

type RelatoriosSearchParams = {
  modo?: string | string[];
  lojaId?: string | string[];
  marketplace?: string | string[];
  data?: string | string[];
};

function getFirstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<RelatoriosSearchParams>;
}) {
  const params = await searchParams;
  const requestedMode = getFirstSearchParam(params.modo);
  const requestedStoreId = getFirstSearchParam(params.lojaId)?.trim();
  const requestedMarketplace = getFirstSearchParam(params.marketplace)?.trim();
  const requestedDate = getFirstSearchParam(params.data)?.trim();
  const initialDate =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : undefined;

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Relatórios"
          description="Veja Coleta e Postagem separadas, filtre por marketplace e envie um resumo fácil de conferir."
        />
      </div>
      <RelatoriosView
        initialMode={requestedMode === "romaneio" ? "romaneio" : undefined}
        initialStoreId={requestedStoreId || undefined}
        initialMarketplace={requestedMarketplace || undefined}
        initialDate={initialDate}
      />
    </>
  );
}
