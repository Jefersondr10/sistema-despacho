import { PageHeader } from "@/app/_components/ui";

import { BipagemForm } from "./bipagem-form";

export default function BipagemPage() {
  return (
    <>
      <PageHeader
        title="Bipar Pacotes"
        description="Crie um lote, leia os rastreios e finalize todos os pacotes com segurança."
      />
      <BipagemForm />
    </>
  );
}
