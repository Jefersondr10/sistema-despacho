const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const FEEDBACK_EMAIL_TIMEOUT_MS = 10_000;

type FeedbackEmailFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type FeedbackEmailResult =
  | { sent: true }
  | {
      sent: false;
      reason: "not_configured" | "invalid_recipient" | "delivery_failed";
    };

export type FeedbackSubmissionEmailInput = {
  notificationId: string;
  feedback: {
    id: string;
    category: string;
    area: string;
    subject: string;
    message: string;
    pagePath: string | null;
    createdAt: string;
  };
  authenticatedUser: {
    email: string;
  };
};

export type FeedbackResponseEmailInput = {
  notificationId: string;
  feedback: {
    id: string;
    subject: string;
    response: string;
    senderEmail: string;
  };
};

type ResendEmail = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  replyTo?: string;
};

const categoryLabels: Record<string, string> = {
  sugestao: "Sugestao",
  reclamacao: "Reclamacao",
  problema: "Problema",
  duvida: "Duvida",
  elogio: "Elogio",
};

const areaLabels: Record<string, string> = {
  bipagem: "Bipagem",
  pacotes: "Pacotes",
  relatorios: "Relatorios",
  cadastros: "Cadastros",
  geral: "Geral",
};

export function escapeFeedbackEmailHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isEmailAddress(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim();
  return (
    normalized.length >= 3 &&
    normalized.length <= 320 &&
    !/\s/.test(normalized) &&
    normalized.indexOf("@") > 0 &&
    normalized.lastIndexOf("@") === normalized.indexOf("@") &&
    normalized.indexOf("@") < normalized.length - 1
  );
}

export function normalizeFeedbackRecipientEmails(value: unknown) {
  if (!Array.isArray(value) || value.length > 50) {
    return null;
  }

  const recipients: string[] = [];
  const seen = new Set<string>();

  for (const candidate of value) {
    if (typeof candidate !== "string" || !isEmailAddress(candidate)) {
      return null;
    }

    const normalized = candidate.trim();
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      recipients.push(normalized);
    }
  }

  return recipients;
}

function normalizeLabel(labels: Record<string, string>, value: string) {
  return labels[value] ?? value;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export function createFeedbackSubmissionIdempotencyKey(
  notificationId: string,
) {
  return `feedback-submission:${notificationId}`;
}

export function createFeedbackResponseIdempotencyKey(
  notificationId: string,
) {
  return `feedback-response:${notificationId}`;
}

export function buildFeedbackSubmissionEmail(
  input: FeedbackSubmissionEmailInput,
) {
  const { feedback, authenticatedUser } = input;
  const category = normalizeLabel(categoryLabels, feedback.category);
  const area = normalizeLabel(areaLabels, feedback.area);
  const sender = authenticatedUser.email ?? "E-mail autenticado indisponivel";
  const pagePath = feedback.pagePath ?? "Nao informado";
  const createdAt = formatDate(feedback.createdAt);

  const subject = "Novo feedback no Sistema Despacho";
  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
            <tr><td style="padding:22px 24px;background:#172554;color:#ffffff;border-radius:12px 12px 0 0;"><strong style="font-size:20px;">Novo feedback recebido</strong></td></tr>
            <tr><td style="padding:24px;color:#0f172a;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 14px;"><strong>Categoria:</strong> ${escapeFeedbackEmailHtml(category)}<br /><strong>Area:</strong> ${escapeFeedbackEmailHtml(area)}<br /><strong>Enviado por:</strong> ${escapeFeedbackEmailHtml(sender)}<br /><strong>Pagina:</strong> ${escapeFeedbackEmailHtml(pagePath)}<br /><strong>Data:</strong> ${escapeFeedbackEmailHtml(createdAt)}<br /><strong>ID:</strong> ${escapeFeedbackEmailHtml(feedback.id)}</p>
              <p style="margin:18px 0 6px;color:#475569;font-size:12px;font-weight:700;text-transform:uppercase;">Assunto</p>
              <p style="margin:0 0 18px;font-size:16px;font-weight:700;">${escapeFeedbackEmailHtml(feedback.subject)}</p>
              <p style="margin:0 0 6px;color:#475569;font-size:12px;font-weight:700;text-transform:uppercase;">Mensagem</p>
              <div style="white-space:pre-wrap;overflow-wrap:anywhere;">${escapeFeedbackEmailHtml(feedback.message)}</div>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  `;
  const text = [
    "NOVO FEEDBACK RECEBIDO",
    "",
    `Categoria: ${category}`,
    `Area: ${area}`,
    `Enviado por: ${sender}`,
    `Pagina: ${pagePath}`,
    `Data: ${createdAt}`,
    `ID: ${feedback.id}`,
    "",
    `Assunto: ${feedback.subject}`,
    "",
    feedback.message,
  ].join("\n");

  return { subject, html, text };
}

export function buildFeedbackResponseEmail(input: FeedbackResponseEmailInput) {
  const { feedback } = input;

  const subject = "Atualizacao do seu feedback no Sistema Despacho";
  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
            <tr><td style="padding:22px 24px;background:#172554;color:#ffffff;border-radius:12px 12px 0 0;"><strong style="font-size:20px;">Temos uma resposta para voce</strong></td></tr>
            <tr><td style="padding:24px;color:#0f172a;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 14px;"><strong>ID:</strong> ${escapeFeedbackEmailHtml(feedback.id)}</p>
              <p style="margin:18px 0 6px;color:#475569;font-size:12px;font-weight:700;text-transform:uppercase;">Seu assunto</p>
              <p style="margin:0 0 18px;font-size:16px;font-weight:700;">${escapeFeedbackEmailHtml(feedback.subject)}</p>
              <p style="margin:0 0 6px;color:#475569;font-size:12px;font-weight:700;text-transform:uppercase;">Resposta</p>
              <div style="white-space:pre-wrap;overflow-wrap:anywhere;">${escapeFeedbackEmailHtml(feedback.response)}</div>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  `;
  const text = [
    "ATUALIZACAO DO SEU FEEDBACK",
    "",
    `ID: ${feedback.id}`,
    `Seu assunto: ${feedback.subject}`,
    "",
    "Resposta:",
    feedback.response,
  ].join("\n");

  return { subject, html, text };
}

async function sendWithResend(
  email: ResendEmail,
  fetcher: FeedbackEmailFetcher,
): Promise<FeedbackEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const from = process.env.RELATORIOS_EMAIL_FROM?.trim() ?? "";

  if (!apiKey || !from) {
    return { sent: false, reason: "not_configured" };
  }

  if (
    !email.to.length ||
    email.to.length > 50 ||
    email.to.some((recipient) => !isEmailAddress(recipient))
  ) {
    return { sent: false, reason: "invalid_recipient" };
  }

  const idempotencyKey = email.idempotencyKey.slice(0, 256);

  try {
    const response = await fetcher(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(FEEDBACK_EMAIL_TIMEOUT_MS),
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { sent: false, reason: "delivery_failed" };
    }

    await response.body?.cancel().catch(() => undefined);
    return { sent: true };
  } catch {
    return { sent: false, reason: "delivery_failed" };
  }
}

export async function sendFeedbackSubmissionEmail(
  input: FeedbackSubmissionEmailInput,
  recipients: readonly string[],
  fetcher: FeedbackEmailFetcher = fetch,
): Promise<FeedbackEmailResult> {
  const to = normalizeFeedbackRecipientEmails(recipients);
  if (!to) {
    return { sent: false, reason: "invalid_recipient" };
  }
  if (!to.length) {
    return { sent: false, reason: "not_configured" };
  }

  const content = buildFeedbackSubmissionEmail(input);
  const replyTo = isEmailAddress(input.authenticatedUser.email)
    ? input.authenticatedUser.email!.trim()
    : undefined;

  return sendWithResend(
    {
      to,
      ...content,
      idempotencyKey: createFeedbackSubmissionIdempotencyKey(
        input.notificationId,
      ),
      replyTo,
    },
    fetcher,
  );
}

export async function sendFeedbackResponseEmail(
  input: FeedbackResponseEmailInput,
  fetcher: FeedbackEmailFetcher = fetch,
): Promise<FeedbackEmailResult> {
  const content = buildFeedbackResponseEmail(input);

  return sendWithResend(
    {
      to: [input.feedback.senderEmail],
      ...content,
      idempotencyKey: createFeedbackResponseIdempotencyKey(
        input.notificationId,
      ),
    },
    fetcher,
  );
}
