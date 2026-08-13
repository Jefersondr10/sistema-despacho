import { PageHeader } from "@/app/_components/ui";

import { RelatoriosView } from "./relatorios-view";

export default function RelatoriosPage() {
  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Relatórios"
          description="Veja Coleta e Postagem separadas, filtre por marketplace e envie um resumo fácil de conferir."
        />
      </div>
      <RelatoriosView />
    </>
  );
}
