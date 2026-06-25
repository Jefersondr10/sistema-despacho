import { PageHeader } from "@/app/_components/ui";

import { CadastrosView } from "./cadastros-view";

export default function CadastrosPage() {
  return (
    <>
      <PageHeader
        title="Cadastros"
        description="Cadastre lojas, marketplaces, transportadoras e destinatários de relatórios."
      />
      <CadastrosView />
    </>
  );
}
