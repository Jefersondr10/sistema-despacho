import { NextResponse } from "next/server";

import { getFeedbackDeliveryClient } from "@/lib/feedback-delivery-client";
import {
  FEEDBACK_SUBMISSION_RECIPIENT,
  sendFeedbackSubmissionEmail,
} from "@/lib/feedback-email";

import {
  authenticateFeedbackRequest,
  feedbackErrorResponse,
  mapFeedbackDatabaseError,
  normalizeFeedbackRow,
  normalizeSubmissionDeliveryContext,
  readFeedbackJsonBody,
  validateFeedbackSubmission,
  FeedbackRequestError,
} from "./_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const authentication = await authenticateFeedbackRequest(request);
  if (!authentication.ok) {
    return authentication.response;
  }

  try {
    const payload = validateFeedbackSubmission(
      await readFeedbackJsonBody(request),
    );
    const { data, error } = await authentication.supabase.rpc(
      "submit_feedback",
      {
        p_submission_key: payload.submissionId,
        p_category: payload.category,
        p_area: payload.area,
        p_subject: payload.subject,
        p_message: payload.message,
        p_page_path: payload.pagePath,
      },
    );

    if (error) {
      throw mapFeedbackDatabaseError(error);
    }

    const feedback = normalizeFeedbackRow(data);
    if (!feedback) {
      throw new FeedbackRequestError(
        500,
        "O feedback foi recebido, mas nao foi possivel confirmar os dados salvos.",
      );
    }

    const deliveryClient = getFeedbackDeliveryClient();
    if (!deliveryClient) {
      return NextResponse.json(
        {
          ok: true,
          feedback,
          notificationSent: false,
          message:
            "Feedback salvo. O servico interno de notificacao nao esta configurado.",
        },
        { status: 201 },
      );
    }

    let deliveryContext: ReturnType<
      typeof normalizeSubmissionDeliveryContext
    > = null;
    try {
      const { data: context, error: contextError } = await deliveryClient.rpc(
        "get_feedback_submission_delivery_context_v2",
        {
          p_feedback_id: feedback.id,
          p_user_id: authentication.user.id,
        },
      );

      if (!contextError) {
        deliveryContext = normalizeSubmissionDeliveryContext(context);
      }
    } catch {
      deliveryContext = null;
    }

    if (!deliveryContext) {
      return NextResponse.json(
        {
          ok: true,
          feedback,
          notificationSent: false,
          message:
            "Feedback salvo, mas a notificacao por e-mail nao pode ser verificada.",
        },
        { status: 201 },
      );
    }

    if (deliveryContext.notifiedAt) {
      return NextResponse.json(
        {
          ok: true,
          feedback,
          notificationSent: true,
          message: "Feedback recebido com sucesso.",
        },
        { status: 201 },
      );
    }

    let notification: Awaited<ReturnType<typeof sendFeedbackSubmissionEmail>>;
    try {
      notification = await sendFeedbackSubmissionEmail(
        {
          notificationId: deliveryContext.notificationId,
          feedback: {
            id: feedback.id,
            category: feedback.category,
            area: feedback.area,
            subject: feedback.subject,
            message: feedback.message,
            pagePath: feedback.page_path,
            createdAt: feedback.created_at,
          },
          authenticatedUser: { email: authentication.user.email },
        },
        [FEEDBACK_SUBMISSION_RECIPIENT],
      );
    } catch {
      notification = { sent: false, reason: "delivery_failed" };
    }

    let notificationPersistenceConfirmed = false;
    if (notification.sent) {
      try {
        const { data: marked, error: markError } =
          await deliveryClient.rpc(
            "mark_feedback_submission_notified",
            {
              p_feedback_id: feedback.id,
              p_notification_id: deliveryContext.notificationId,
            },
          );
        notificationPersistenceConfirmed = !markError && marked === true;
      } catch {
        // O feedback e o e-mail ja foram processados; uma falha de marcacao
        // nao deve transformar o envio persistido em erro para o usuario.
      }
    }

    const message = notification.sent
      ? notificationPersistenceConfirmed
        ? "Feedback enviado com sucesso."
        : "Feedback salvo e e-mail enviado."
      : notification.reason === "not_configured"
        ? "Feedback salvo. A notificacao por e-mail ainda nao esta configurada."
        : "Feedback salvo, mas a notificacao por e-mail nao foi enviada.";

    return NextResponse.json(
      {
        ok: true,
        feedback,
        notificationSent: notification.sent,
        message,
      },
      { status: 201 },
    );
  } catch (error) {
    return feedbackErrorResponse(error);
  }
}
