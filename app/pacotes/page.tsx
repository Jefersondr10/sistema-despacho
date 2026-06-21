import { PageHeader } from "@/app/_components/ui";

import { PacotesView } from "./pacotes-view";

export default function PacotesPage() {
  return (
    <>
      <PageHeader
        title="Pacotes"
        description="Lista operacional com filtros e pesquisa rápida por rastreio bipado."
      />
      <PacotesView />
    </>
  );
}
