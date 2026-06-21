import { PageHeader } from "@/app/_components/ui";

import { DashboardView } from "./dashboard-view";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Visão geral dos pacotes bipados, sempre filtrada por loja e operação."
      />
      <DashboardView />
    </>
  );
}
