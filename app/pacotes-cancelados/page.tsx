import { PageHeader } from "@/app/_components/ui";

import { PacotesCanceladosView } from "./pacotes-cancelados-view";

export default function PacotesCanceladosPage() {
  return (
    <>
      <PageHeader
        title="Pacotes Cancelados"
        description="Histórico de cancelamentos com os dados originais do pacote e suas justificativas."
      />
      <PacotesCanceladosView />
    </>
  );
}
