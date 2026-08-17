import { PageHeader } from "@/app/_components/ui";

import { BipagemForm } from "./bipagem-form";

export default function BipagemPage() {
  return (
    <>
      <h1 className="sr-only xl:hidden">Bipar Pacotes</h1>
      <div className="hidden xl:block">
        <PageHeader
          title="Bipar Pacotes"
          description="Crie um lote, leia os rastreios e finalize todos os pacotes com segurança."
        />
      </div>
      <BipagemForm />
    </>
  );
}
