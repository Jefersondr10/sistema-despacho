import { NextResponse } from "next/server";

import { getFeedbackDeliveryClient } from "@/lib/feedback-delivery-client";
import { sendFeedbackResponseEmail } from "@/lib/feedback-email";

import {
  authenticateFeedbackRequest,
  feedbackErrorResponse,
  mapFeedbackDatabaseError,
  normalizeFeedbackRow,
  normalizeResponseNotificationState,
  readFeedbackJsonBody,
  validateFeedbackId,
  validateFeedbackReview,
  FeedbackRequestError,
} from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FeedbackRouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(
  request: Request,
  { params }: FeedbackRouteContext,
) {
  const authentication = await authenticateFeedbackRequest(request);
  if (!authentication.ok) {
    return authentication.response;
  }

  try {
    const feedbackId = validateFeedbackId((await params).id);
    const review = validateFeedbackReview(await readFeedbackJsonBody(request));
    const { data, error } = await authentication.supabase.rpc(
      "review_feedback",
      {
        p_feedback_id: feedbackId,
        p_status: review.status,
        p_response: review.response,
        p_expected_updated_at: review.expectedUpdatedAt,
      },
    );

    if (error) {
      throw mapFeedbackDatabaseError(error);
    }

    const feedback = normalizeFeedbackRow(data);
    if (!feedback) {
      throw new FeedbackRequestError(
        500,
        "O feedback foi atualizado, mas nao foi possivel confirmar os dados salvos.",
      );
    }

    if (!feedback.admin_response) {
      return NextResponse.json({
        ok: true,
        feedback,
        message: "Feedback atualizado.",
      });
    }

    const deliveryClient = getFeedbackDeliveryClient();
    if (!deliveryClient) {
      return NextResponse.json({
        ok: true,
        feedback,
        notificationSent: false,
        message:
          "Feedback atualizado, mas o servico interno de notificacao nao esta configurado.",
      });
    }

    let currentNotification: ReturnType<
      typeof normalizeResponseNotificationState
    > = null;
    try {
      const { data: current, error: currentError } = await deliveryClient.rpc(
        "get_feedback_response_notification_state",
        { p_feedback_id: feedbackId },
      );

      if (!currentError) {
        currentNotification = normalizeResponseNotificationState(current);
      }
    } catch {
      currentNotification = null;
    }

    if (!currentNotification) {
      return NextResponse.json({
        ok: true,
        feedback,
        notificationSent: false,
        message:
          "Feedback atualizado, mas o e-mail nao foi enviado com seguranca.",
      });
    }

    if (!currentNotification.notificationId || currentNotification.notifiedAt) {
      return NextResponse.json({
        ok: true,
        feedback,
        message: "Feedback atualizado.",
      });
    }

    let notification: Awaited<ReturnType<typeof sendFeedbackResponseEmail>>;
    try {
      notification = await sendFeedbackResponseEmail({
        notificationId: currentNotification.notificationId,
        feedback: {
          id: feedback.id,
          subject: currentNotification.subject,
          response: currentNotification.responseText,
          senderEmail: currentNotification.recipientEmail,
        },
      });
    } catch {
      notification = { sent: false, reason: "delivery_failed" };
    }

    let notificationPersistenceConfirmed = false;
    if (notification.sent) {
      try {
        const { data: marked, error: markError } =
          await deliveryClient.rpc(
            "mark_feedback_response_notified",
            {
              p_feedback_id: feedback.id,
              p_notification_id: currentNotification.notificationId,
            },
          );
        notificationPersistenceConfirmed = !markError && marked === true;
      } catch {
        // O feedback e o e-mail ja foram processados; um retry imediato
        // reutiliza o mesmo notification ID.
      }
    }

    return NextResponse.json({
      ok: true,
      feedback,
      notificationSent: notification.sent,
      message: notification.sent
        ? notificationPersistenceConfirmed
          ? "Feedback atualizado e usuário notificado."
          : "Feedback atualizado e e-mail enviado."
        : "Feedback atualizado, mas o e-mail não foi enviado.",
    });
  } catch (error) {
    return feedbackErrorResponse(error);
  }
}
