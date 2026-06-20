import { PageHeader } from "@/app/_components/ui";
import {
  carriers,
  dispatchCancellations,
  dispatchPackages,
  marketplaces,
  stores,
} from "@/app/_lib/mock-data";

import { PacotesView } from "./pacotes-view";

export default function PacotesPage() {
  return (
    <>
      <PageHeader
        title="Pacotes"
        description="Lista operacional com filtros e pesquisa rápida por rastreio bipado."
      />
      <PacotesView
        packages={dispatchPackages}
        cancellations={dispatchCancellations}
        stores={stores}
        marketplaces={marketplaces}
        carriers={carriers}
      />
    </>
  );
}
