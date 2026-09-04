import { PageHeader } from "@/app/_components/ui";

import { CadastrosView } from "./cadastros-view";

export default function CadastrosPage() {
  return (
    <>
      <PageHeader
        title="Cadastros"
        description="Cadastre lojas, marketplaces, transportadoras, destinatários e a operação padrão de cada combinação."
      />
      <CadastrosView />
    </>
  );
}
