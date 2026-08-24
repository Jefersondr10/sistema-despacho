import { PageHeader } from "@/app/_components/ui";
import { FeedbackView } from "@/app/feedback/feedback-view";

export default function FeedbackAdministrationPage() {
  return (
    <>
      <PageHeader
        eyebrow="Área administrativa"
        title="Gerenciar feedbacks"
        description="Veja as solicitações recebidas, responda os usuários e acompanhe cada atendimento sem misturar esta área com a operação dos funcionários."
      />
      <FeedbackView mode="management" />
    </>
  );
}
