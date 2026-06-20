import { PageHeader } from "@/app/_components/ui";
import { carriers, marketplaces, stores } from "@/app/_lib/mock-data";

import { CadastrosView } from "./cadastros-view";

export default function CadastrosPage() {
  return (
    <>
      <PageHeader
        title="Cadastros"
        description="Cadastre e exclua lojas, marketplaces e transportadoras para simular a operação."
      />
      <CadastrosView
        stores={stores}
        marketplaces={marketplaces}
        carriers={carriers}
      />
    </>
  );
}
