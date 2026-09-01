import { PageHeader } from "@/app/_components/ui";

import { TeamManagementView } from "./team-management-view";

export default function EquipePage() {
  return (
    <>
      <PageHeader
        eyebrow="Administração"
        title="Equipe"
        description="Cadastre usuários e acompanhe quem realizou cada ação no sistema."
      />
      <TeamManagementView />
    </>
  );
}

