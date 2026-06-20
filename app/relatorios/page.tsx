import { PageHeader } from "@/app/_components/ui";
import {
  carriers,
  dispatchCancellations,
  dispatchPackages,
  marketplaces,
  stores,
} from "@/app/_lib/mock-data";

import { RelatoriosView } from "./relatorios-view";

export default function RelatoriosPage() {
  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Consulta visual em formato resumido ou detalhado."
      />
      <RelatoriosView
        packages={dispatchPackages}
        cancellations={dispatchCancellations}
        stores={stores}
        marketplaces={marketplaces}
        carriers={carriers}
      />
    </>
  );
}
