import { PageHeader } from "@/app/_components/ui";

import { RelatoriosView } from "./relatorios-view";

export default function RelatoriosPage() {
  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Consulta visual em formato resumido ou detalhado."
      />
      <RelatoriosView />
    </>
  );
}
