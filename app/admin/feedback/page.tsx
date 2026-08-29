import { PageHeader } from "@/app/_components/ui";
import { FeedbackView } from "@/app/feedback/feedback-view";

import { FeedbackNotificationRecipientsManager } from "./feedback-notification-recipients";

export default function FeedbackAdministrationPage() {
  return (
    <>
      <PageHeader
        eyebrow="Área administrativa"
        title="Gerenciar feedbacks"
        description="Veja as solicitações recebidas, responda os usuários e acompanhe cada atendimento sem misturar esta área com a operação dos funcionários."
      />
      <FeedbackNotificationRecipientsManager />
      <FeedbackView mode="management" />
    </>
  );
}
