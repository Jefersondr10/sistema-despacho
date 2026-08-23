import { NextResponse } from "next/server.js";

import {
  createSupabaseClientForAccessToken,
  isSupabaseConfigured,
} from "../../../lib/supabaseClient.ts";

export const FEEDBACK_BODY_LIMIT_BYTES = 16 * 1024;
export const FEEDBACK_BODY_DEADLINE_MS = 12_000;

export const FEEDBACK_CATEGORIES = [
  "sugestao",
  "reclamacao",
  "problema",
  "duvida",
  "elogio",
] as const;

export const FEEDBACK_AREAS = [
  "bipagem",
  "pacotes",
  "relatorios",
  "cadastros",
  "geral",
] as const;

export const FEEDBACK_STATUSES = [
  "novo",
  "em_analise",
  "respondido",
  "resolvido",
  "arquivado",
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export type FeedbackArea = (typeof FEEDBACK_AREAS)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export type FeedbackPublicDto = {
  id: string;
  user_id: string;
  sender_email: string;
  submission_key: string;
  category: FeedbackCategory;
  area: FeedbackArea;
  subject: string;
  message: string;
  page_path: string | null;
  status: FeedbackStatus;
  admin_response: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FeedbackSubmission = {
  submissionId: string;
  category: FeedbackCategory;
  area: FeedbackArea;
  subject: string;
  message: string;
  pagePath: string | null;
};

export type FeedbackReview = {
  status: FeedbackStatus;
  response: string | null;
  expectedUpdatedAt: string;
};

type FeedbackErrorStatus =
  | 400
  | 401
  | 403
  | 404
  | 408
  | 409
  | 413
  | 429
  | 500
  | 503;

export class FeedbackRequestError extends Error {
  readonly status: FeedbackErrorStatus;
  readonly publicMessage: string;

  constructor(
    status: FeedbackErrorStatus,
    publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "FeedbackRequestError";
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  const received = Object.keys(value).sort();
  const required = [...expected].sort();

  return (
    received.length === required.length &&
    received.every((key, index) => key === required[index])
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function validateFeedbackId(value: unknown) {
  if (!isUuid(value)) {
    throw new FeedbackRequestError(400, "Identificador de feedback invalido.");
  }

  return value;
}

function characterLength(value: string) {
  return Array.from(value).length;
}

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function requireTrimmedString(
  value: unknown,
  fieldLabel: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== "string") {
    throw new FeedbackRequestError(400, `${fieldLabel} invalido.`);
  }

  const normalized = value.trim();
  const length = characterLength(normalized);

  if (length < minimum || length > maximum) {
    throw new FeedbackRequestError(
      400,
      `${fieldLabel} deve ter entre ${minimum} e ${maximum} caracteres.`,
    );
  }

  return normalized;
}

async function readRequestTextWithLimit(
  request: Request,
  deadlineMs: number,
) {
  const declaredLength = request.headers.get("content-length")?.trim() ?? "";

  if (/^\d+$/.test(declaredLength)) {
    const declaredBytes = Number(declaredLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > FEEDBACK_BODY_LIMIT_BYTES) {
      throw new FeedbackRequestError(
        413,
        "O conteudo enviado excede o limite de 16 KB.",
      );
    }
  }

  if (!request.body) {
    throw new FeedbackRequestError(400, "Payload JSON invalido.");
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let receivedBytes = 0;
  let text = "";
  let deadlineHandle: ReturnType<typeof setTimeout> | undefined;
  const deadlineError = new FeedbackRequestError(
    408,
    "O envio do conteudo demorou demais. Tente novamente.",
  );
  const deadline = new Promise<never>((_resolve, reject) => {
    deadlineHandle = setTimeout(
      () => reject(deadlineError),
      Math.max(1, deadlineMs),
    );
  });

  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) {
        break;
      }

      receivedBytes += value.byteLength;
      if (receivedBytes > FEEDBACK_BODY_LIMIT_BYTES) {
        throw new FeedbackRequestError(
          413,
          "O conteudo enviado excede o limite de 16 KB.",
        );
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
    return text;
  } catch (error) {
    try {
      void reader.cancel().catch(() => undefined);
    } catch {
      // O cancelamento e apenas limpeza; nunca deve prolongar o deadline.
    }

    if (error instanceof FeedbackRequestError) {
      throw error;
    }

    throw new FeedbackRequestError(400, "Payload JSON invalido.");
  } finally {
    if (deadlineHandle) {
      clearTimeout(deadlineHandle);
    }
    try {
      reader.releaseLock();
    } catch {
      // Uma leitura pendente pode manter o lock ate o cancelamento terminar.
    }
  }
}

export async function readFeedbackJsonBody(
  request: Request,
  deadlineMs = FEEDBACK_BODY_DEADLINE_MS,
) {
  const text = await readRequestTextWithLimit(request, deadlineMs);

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new FeedbackRequestError(400, "Payload JSON invalido.");
  }
}

export function validateFeedbackSubmission(
  value: unknown,
): FeedbackSubmission {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "submissionId",
      "category",
      "area",
      "subject",
      "message",
      "pagePath",
    ])
  ) {
    throw new FeedbackRequestError(400, "Payload de feedback invalido.");
  }

  if (!isUuid(value.submissionId)) {
    throw new FeedbackRequestError(400, "Identificador de envio invalido.");
  }

  if (!isOneOf(value.category, FEEDBACK_CATEGORIES)) {
    throw new FeedbackRequestError(400, "Categoria de feedback invalida.");
  }

  if (!isOneOf(value.area, FEEDBACK_AREAS)) {
    throw new FeedbackRequestError(400, "Area de feedback invalida.");
  }

  const subject = requireTrimmedString(value.subject, "Assunto", 3, 120);
  const message = requireTrimmedString(value.message, "Mensagem", 20, 4000);
  let pagePath: string | null = null;

  if (value.pagePath !== null) {
    if (typeof value.pagePath !== "string") {
      throw new FeedbackRequestError(400, "Caminho da pagina invalido.");
    }

    const normalizedPath = value.pagePath.trim();
    if (characterLength(normalizedPath) > 200) {
      throw new FeedbackRequestError(
        400,
        "Caminho da pagina deve ter no maximo 200 caracteres.",
      );
    }
    pagePath = normalizedPath || null;
  }

  return {
    submissionId: value.submissionId,
    category: value.category,
    area: value.area,
    subject,
    message,
    pagePath,
  };
}

export function validateFeedbackReview(value: unknown): FeedbackReview {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["status", "response", "expectedUpdatedAt"])
  ) {
    throw new FeedbackRequestError(400, "Payload de revisao invalido.");
  }

  if (!isOneOf(value.status, FEEDBACK_STATUSES)) {
    throw new FeedbackRequestError(400, "Status de feedback invalido.");
  }

  if (value.response !== null && typeof value.response !== "string") {
    throw new FeedbackRequestError(400, "Resposta de feedback invalida.");
  }

  const response =
    typeof value.response === "string" ? value.response.trim() || null : null;
  const responseLength = response ? characterLength(response) : 0;

  if (responseLength > 4000) {
    throw new FeedbackRequestError(
      400,
      "Resposta deve ter no maximo 4000 caracteres.",
    );
  }

  if (value.status === "respondido" && responseLength < 3) {
    throw new FeedbackRequestError(
      400,
      "Resposta deve ter entre 3 e 4000 caracteres para marcar como respondido.",
    );
  }

  if (typeof value.expectedUpdatedAt !== "string") {
    throw new FeedbackRequestError(
      400,
      "Versao esperada do feedback invalida.",
    );
  }

  const expectedUpdatedAt = value.expectedUpdatedAt.trim();
  if (
    expectedUpdatedAt.length > 64 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i.test(
      expectedUpdatedAt,
    ) ||
    Number.isNaN(Date.parse(expectedUpdatedAt))
  ) {
    throw new FeedbackRequestError(
      400,
      "Versao esperada do feedback invalida.",
    );
  }

  return { status: value.status, response, expectedUpdatedAt };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function normalizeFeedbackRow(
  value: unknown,
): FeedbackPublicDto | null {
  const candidate = value;

  if (
    !isRecord(candidate) ||
    !isUuid(candidate.id) ||
    !isUuid(candidate.user_id) ||
    !isUuid(candidate.submission_key) ||
    typeof candidate.sender_email !== "string" ||
    !candidate.sender_email.includes("@") ||
    !isOneOf(candidate.category, FEEDBACK_CATEGORIES) ||
    !isOneOf(candidate.area, FEEDBACK_AREAS) ||
    typeof candidate.subject !== "string" ||
    typeof candidate.message !== "string" ||
    !isNullableString(candidate.page_path) ||
    !isOneOf(candidate.status, FEEDBACK_STATUSES) ||
    !isNullableString(candidate.admin_response) ||
    !isNullableString(candidate.reviewed_at) ||
    typeof candidate.created_at !== "string" ||
    typeof candidate.updated_at !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    user_id: candidate.user_id,
    sender_email: candidate.sender_email,
    submission_key: candidate.submission_key,
    category: candidate.category,
    area: candidate.area,
    subject: candidate.subject,
    message: candidate.message,
    page_path: candidate.page_path,
    status: candidate.status,
    admin_response: candidate.admin_response,
    reviewed_at: candidate.reviewed_at,
    created_at: candidate.created_at,
    updated_at: candidate.updated_at,
  };
}

export function normalizeSubmissionNotificationState(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (
    !isRecord(candidate) ||
    !isUuid(candidate.notification_id) ||
    !isNullableString(candidate.notified_at)
  ) {
    return null;
  }

  return {
    notificationId: candidate.notification_id,
    notifiedAt: candidate.notified_at,
  };
}

export function normalizeResponseNotificationState(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (
    !isRecord(candidate) ||
    !(
      candidate.notification_id === null ||
      isUuid(candidate.notification_id)
    ) ||
    !isNullableString(candidate.notified_at) ||
    typeof candidate.recipient_email !== "string" ||
    !candidate.recipient_email.includes("@") ||
    !isNullableString(candidate.response_text) ||
    typeof candidate.subject !== "string" ||
    (candidate.notification_id === null) !== (candidate.response_text === null)
  ) {
    return null;
  }

  if (candidate.notification_id === null) {
    return {
      notificationId: null,
      notifiedAt: candidate.notified_at,
      recipientEmail: candidate.recipient_email.trim(),
      responseText: null,
      subject: candidate.subject,
    };
  }

  if (candidate.response_text === null) {
    return null;
  }

  return {
    notificationId: candidate.notification_id,
    notifiedAt: candidate.notified_at,
    recipientEmail: candidate.recipient_email.trim(),
    responseText: candidate.response_text,
    subject: candidate.subject,
  };
}

type DatabaseErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

function databaseErrorText(error: unknown) {
  if (!isRecord(error)) {
    return "";
  }

  const typed = error as DatabaseErrorLike;
  return [typed.code, typed.message, typed.details, typed.hint]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLocaleLowerCase("pt-BR");
}

export function mapFeedbackDatabaseError(error: unknown) {
  const text = databaseErrorText(error);

  if (text.includes("feedback_idempotency_conflict")) {
    return new FeedbackRequestError(
      409,
      "Este identificador de envio ja foi usado com dados diferentes.",
    );
  }

  if (text.includes("feedback_conflict")) {
    return new FeedbackRequestError(
      409,
      "Este feedback foi alterado em outra tela. Atualize e tente novamente.",
    );
  }

  if (
    text.includes("feedback_rate_limited") ||
    (text.includes("limite de") && text.includes("feedback")) ||
    text.includes("rate limit")
  ) {
    return new FeedbackRequestError(
      429,
      "Muitos feedbacks enviados em pouco tempo. Aguarde e tente novamente.",
    );
  }

  if (
    text.includes("administrador de feedback obrigatorio") ||
    text.includes("feedback_forbidden") ||
    text.includes("permission denied") ||
    text.includes("42501")
  ) {
    return new FeedbackRequestError(
      403,
      "Voce nao tem permissao para revisar feedbacks.",
    );
  }

  if (text.includes("feedback nao encontrado") || text.includes("p0002")) {
    return new FeedbackRequestError(404, "Feedback nao encontrado.");
  }

  if (text.includes("e-mail autenticado e confirmado indisponivel")) {
    return new FeedbackRequestError(
      403,
      "Confirme seu e-mail antes de usar o feedback.",
    );
  }

  if (
    text.includes("usuario autenticado obrigatorio") ||
    (text.includes("jwt") && text.includes("email")) ||
    text.includes("e-mail autenticado indisponivel no token")
  ) {
    return new FeedbackRequestError(
      401,
      "Sessao invalida ou expirada. Entre novamente.",
    );
  }

  if (
    ["22001", "22023", "22p02", "23514"].some((code) =>
      text.includes(code),
    ) ||
    [
      "submission_key obrigatoria",
      "categoria de feedback invalida",
      "area de feedback invalida",
      "assunto deve ter",
      "mensagem deve ter",
      "caminho da pagina deve ter",
      "status de feedback invalido",
      "resposta deve ter",
      "feedback_id obrigatorio",
      "feedback_validation",
    ].some((marker) => text.includes(marker))
  ) {
    return new FeedbackRequestError(400, "Dados de feedback invalidos.");
  }

  return new FeedbackRequestError(
    500,
    "Nao foi possivel salvar o feedback agora. Tente novamente.",
  );
}

export function feedbackErrorResponse(error: unknown) {
  const safeError =
    error instanceof FeedbackRequestError
      ? error
      : new FeedbackRequestError(
          500,
          "Nao foi possivel processar o feedback agora. Tente novamente.",
        );

  return NextResponse.json(
    { ok: false, message: safeError.publicMessage },
    { status: safeError.status },
  );
}

type FeedbackAuthenticationSuccess = {
  ok: true;
  supabase: ReturnType<typeof createSupabaseClientForAccessToken>;
  user: {
    id: string;
    email: string;
    emailConfirmedAt: string;
  };
};

type FeedbackAuthenticationFailure = {
  ok: false;
  response: NextResponse;
};

export async function authenticateFeedbackRequest(
  request: Request,
): Promise<FeedbackAuthenticationSuccess | FeedbackAuthenticationFailure> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, message: "Supabase nao configurado." },
        { status: 503 },
      ),
    };
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  const token = match?.[1] ?? "";

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, message: "Sessao obrigatoria." },
        { status: 401 },
      ),
    };
  }

  try {
    const supabase = createSupabaseClientForAccessToken(token);
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            message: "Sessao invalida ou expirada. Entre novamente.",
          },
          { status: 401 },
        ),
      };
    }

    const email =
      typeof data.user.email === "string" ? data.user.email.trim() : "";
    const emailConfirmedAt =
      typeof data.user.email_confirmed_at === "string"
        ? data.user.email_confirmed_at.trim()
        : "";

    if (!email || !emailConfirmedAt) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            message: "Confirme seu e-mail antes de usar o feedback.",
          },
          { status: 403 },
        ),
      };
    }

    return {
      ok: true,
      supabase,
      user: {
        id: data.user.id,
        email,
        emailConfirmedAt,
      },
    };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          message: "Nao foi possivel validar a sessao agora. Tente novamente.",
        },
        { status: 503 },
      ),
    };
  }
}
