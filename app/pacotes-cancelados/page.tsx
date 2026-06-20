import { PageHeader } from "@/app/_components/ui";
import {
  carriers,
  dispatchCancellations,
  marketplaces,
  stores,
} from "@/app/_lib/mock-data";

import { PacotesCanceladosView } from "./pacotes-cancelados-view";

export default function PacotesCanceladosPage() {
  return (
    <>
      <PageHeader
        title="Pacotes Cancelados"
        description="Histórico de cancelamentos com dados da bipagem original e justificativas."
      />
      <PacotesCanceladosView
        stores={stores}
        marketplaces={marketplaces}
        carriers={carriers}
        cancellations={dispatchCancellations}
      />
    </>
  );
}
