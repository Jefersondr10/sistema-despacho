import { PageHeader } from "@/app/_components/ui";
import {
  carriers,
  dispatchBatches,
  dispatchCancellations,
  dispatchMovements,
  dispatchPackages,
  marketplaces,
  stores,
} from "@/app/_lib/mock-data";

import { BipagemForm } from "./bipagem-form";

export default function BipagemPage() {
  return (
    <>
      <PageHeader
        title="Bipagem"
        description="Sessão em massa para bipar vários rastreios com os mesmos dados de loja, marketplace e etiqueta."
      />
      <BipagemForm
        stores={stores}
        marketplaces={marketplaces}
        carriers={carriers}
        initialPackages={dispatchPackages}
        initialBatches={dispatchBatches}
        initialMovements={dispatchMovements}
        initialCancellations={dispatchCancellations}
      />
    </>
  );
}
