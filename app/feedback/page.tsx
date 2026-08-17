import { PageHeader } from "@/app/_components/ui";

import { FeedbackView } from "./feedback-view";

export default function FeedbackPage() {
  return (
    <>
      <PageHeader
        title="Feedback"
        description="Envie sugestões, reclamações ou dúvidas e acompanhe cada retorno em um só lugar."
      />
      <FeedbackView />
    </>
  );
}
