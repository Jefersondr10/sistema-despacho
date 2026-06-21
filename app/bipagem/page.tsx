import { PageHeader } from "@/app/_components/ui";

import { BipagemForm } from "./bipagem-form";

export default function BipagemPage() {
  return (
    <>
      <PageHeader
        title="Bipagem"
        description="Sessão em massa para bipar vários rastreios com os mesmos dados de loja, marketplace e etiqueta."
      />
      <BipagemForm />
    </>
  );
}
