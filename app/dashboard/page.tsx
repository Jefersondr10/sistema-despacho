import { PageHeader } from "@/app/_components/ui";
import {
  carriers,
  dispatchCancellations,
  dispatchMovements,
  dispatchPackages,
  marketplaces,
  stores,
} from "@/app/_lib/mock-data";

import { DashboardView } from "./dashboard-view";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Visão geral dos pacotes bipados, sempre filtrada por loja e operação."
      />
      <DashboardView
        packages={dispatchPackages}
        cancellations={dispatchCancellations}
        movements={dispatchMovements}
        stores={stores}
        marketplaces={marketplaces}
        carriers={carriers}
      />
    </>
  );
}
