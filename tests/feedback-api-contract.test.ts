import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FEEDBACK_BODY_LIMIT_BYTES,
  FEEDBACK_BODY_DEADLINE_MS,
  FeedbackRequestError,
  mapFeedbackDatabaseError,
  normalizeFeedbackRow,
  normalizeResponseNotificationState,
  normalizeSubmissionDeliveryContext,
  readFeedbackJsonBody,
  validateFeedbackReview,
  validateFeedbackSubmission,
} from "../app/api/feedback/_shared.ts";
import {
  buildFeedbackResponseEmail,
  buildFeedbackSubmissionEmail,
  createFeedbackResponseIdempotencyKey,
  createFeedbackSubmissionIdempotencyKey,
  normalizeFeedbackRecipientEmails,
  sendFeedbackSubmissionEmail,
} from "../lib/feedback-email.ts";

const postRouteSource = readFileSync(
  new URL("../app/api/feedback/route.ts", import.meta.url),
  "utf8",
);
const patchRouteSource = readFileSync(
  new URL("../app/api/feedback/[id]/route.ts", import.meta.url),
  "utf8",
);
const sharedSource = readFileSync(
  new URL("../app/api/feedback/_shared.ts", import.meta.url),
  "utf8",
);
const emailSource = readFileSync(
  new URL("../lib/feedback-email.ts", import.meta.url),
  "utf8",
);
const deliveryClientSource = readFileSync(
  new URL("../lib/feedback-delivery-client.ts", import.meta.url),
  "utf8",
);
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { dependencies?: Record<string, string> };

const validSubmission = {
  submissionId: "de305d54-75b4-431b-adb2-eb6b9e546014",
  category: "sugestao",
  area: "bipagem",
  subject: "  Melhorar leitura  ",
  message: "  A leitura poderia confirmar o pacote com mais clareza.  ",
  pagePath: "  /bipagem  ",
} as const;

const publicFeedbackRow = {
  id: "de305d54-75b4-431b-adb2-eb6b9e546014",
  user_id: "9e1f2870-1d22-4c60-92ae-7af3c8b8eb1d",
  sender_email: "usuario@example.com",
  submission_key: "1f6e7f2a-72bb-4edc-81b4-2a77f418e76f",
  category: "sugestao",
  area: "bipagem",
  subject: "Melhorar leitura",
  message: "A leitura poderia confirmar o pacote com mais clareza.",
  page_path: "/bipagem",
  status: "novo",
  admin_response: null,
  reviewed_at: null,
  created_at: "2026-08-17T12:00:00.000Z",
  updated_at: "2026-08-17T12:00:00.000Z",
} as const;

const submissionNotificationId = "0dcb60ab-2d4c-4c88-94b8-64fc780fa83a";
const responseNotificationId = "fe1ab1ee-b67f-4b39-bc1d-104063997cc2";

function isRequestErrorWithStatus(error: unknown, status: number) {
  return error instanceof FeedbackRequestError && error.status === status;
}

function restoreEnvironment(
  values: Record<string, string | undefined>,
) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test("POST valida schema estrito, enums portugueses e textos normalizados", () => {
  assert.deepEqual(validateFeedbackSubmission(validSubmission), {
    ...validSubmission,
    subject: "Melhorar leitura",
    message: "A leitura poderia confirmar o pacote com mais clareza.",
    pagePath: "/bipagem",
  });

  assert.throws(
    () => validateFeedbackSubmission({ ...validSubmission, to: "x@example.com" }),
    (error) => isRequestErrorWithStatus(error, 400),
  );
  assert.throws(
    () => validateFeedbackSubmission({ ...validSubmission, category: "bug" }),
    (error) => isRequestErrorWithStatus(error, 400),
  );
  assert.throws(
    () => validateFeedbackSubmission({ ...validSubmission, message: "curta" }),
    (error) => isRequestErrorWithStatus(error, 400),
  );
});

test("leitura do corpo aplica 16 KB aos bytes recebidos sem confiar no header", async () => {
  const request = new Request("http://localhost/api/feedback", {
    method: "POST",
    body: `{"message":"${"a".repeat(FEEDBACK_BODY_LIMIT_BYTES)}"}`,
  });

  await assert.rejects(
    readFeedbackJsonBody(request),
    (error) => isRequestErrorWithStatus(error, 413),
  );
});

test("leitura do corpo encerra um stream lento no deadline total", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"message":"incompleta'));
    },
    cancel() {
      return new Promise<void>(() => undefined);
    },
  });
  const request = new Request(
    "http://localhost/api/feedback",
    {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" },
  );

  await assert.rejects(
    readFeedbackJsonBody(request, 10),
    (error) => isRequestErrorWithStatus(error, 408),
  );
  assert.equal(FEEDBACK_BODY_DEADLINE_MS, 12_000);
});

test("PATCH aceita resposta nula e exige texto ao marcar como respondido", () => {
  const expectedUpdatedAt = "2026-08-17T12:00:00.123456+00:00";
  assert.deepEqual(
    validateFeedbackReview({
      status: "em_analise",
      response: "   ",
      expectedUpdatedAt,
    }),
    { status: "em_analise", response: null, expectedUpdatedAt },
  );
  assert.deepEqual(
    validateFeedbackReview({
      status: "respondido",
      response: "  Resolvido.  ",
      expectedUpdatedAt,
    }),
    { status: "respondido", response: "Resolvido.", expectedUpdatedAt },
  );
  assert.throws(
    () =>
      validateFeedbackReview({
        status: "respondido",
        response: "ok",
        expectedUpdatedAt,
      }),
    (error) => isRequestErrorWithStatus(error, 400),
  );
  assert.throws(
    () =>
      validateFeedbackReview({
        status: "closed",
        response: null,
        expectedUpdatedAt,
      }),
    (error) => isRequestErrorWithStatus(error, 400),
  );
  assert.throws(
    () =>
      validateFeedbackReview({ status: "em_analise", response: null }),
    (error) => isRequestErrorWithStatus(error, 400),
  );
  assert.throws(
    () =>
      validateFeedbackReview({
        status: "em_analise",
        response: null,
        expectedUpdatedAt: "ontem",
      }),
    (error) => isRequestErrorWithStatus(error, 400),
  );
});

test("DTO publico e estados internos de entrega sao normalizados separadamente", () => {
  assert.deepEqual(normalizeFeedbackRow(publicFeedbackRow), publicFeedbackRow);
  assert.equal(normalizeFeedbackRow([publicFeedbackRow]), null);
  assert.equal(normalizeFeedbackRow([]), null);
  assert.equal(
    normalizeFeedbackRow({ ...publicFeedbackRow, sender_email: null }),
    null,
  );

  const withUnexpectedInternalValue = normalizeFeedbackRow({
    ...publicFeedbackRow,
    reviewed_by: "9e1f2870-1d22-4c60-92ae-7af3c8b8eb1d",
    submission_notification_id: submissionNotificationId,
    service_role_secret: "nunca-vazar",
  });
  assert.ok(withUnexpectedInternalValue);
  assert.deepEqual(withUnexpectedInternalValue, publicFeedbackRow);
  assert.doesNotMatch(
    JSON.stringify(withUnexpectedInternalValue),
    /reviewed_by|notification|nunca-vazar/,
  );

  const submissionState = {
    notification_id: submissionNotificationId,
    notified_at: null,
    recipient_emails: ["gestor@example.com", "operacao@example.com"],
    internal_extra: "nunca-vazar",
  };
  assert.deepEqual(normalizeSubmissionDeliveryContext([submissionState]), {
    notificationId: submissionNotificationId,
    notifiedAt: null,
    recipientEmails: ["gestor@example.com", "operacao@example.com"],
  });
  assert.equal(normalizeSubmissionDeliveryContext([]), null);
  assert.equal(
    normalizeSubmissionDeliveryContext([
      { ...submissionState, recipient_emails: ["invalido"] },
    ]),
    null,
  );

  const responseState = {
    notification_id: responseNotificationId,
    notified_at: null,
    recipient_email: "confirmado@example.com",
    response_text: "Resposta persistida",
    subject: "Assunto persistido",
  };
  assert.deepEqual(normalizeResponseNotificationState([responseState]), {
    notificationId: responseNotificationId,
    notifiedAt: null,
    recipientEmail: responseState.recipient_email,
    responseText: responseState.response_text,
    subject: responseState.subject,
  });
  assert.equal(
    normalizeResponseNotificationState([
      { ...responseState, recipient_email: null },
    ]),
    null,
  );
  assert.equal(
    normalizeResponseNotificationState([
      { ...responseState, notification_id: null },
    ]),
    null,
  );
});

test("erros do banco viram respostas publicas estaveis sem detalhes internos", () => {
  const rateLimit = mapFeedbackDatabaseError({
    code: "P0001",
    message: "Limite de 3 feedbacks a cada 15 minutos atingido.",
  });
  const validation = mapFeedbackDatabaseError({
    code: "P0001",
    message: "Categoria de feedback invalida.",
  });
  const internal = mapFeedbackDatabaseError({
    code: "XX000",
    message: "segredo-interno-da-infraestrutura",
  });
  const missingJwtEmail = mapFeedbackDatabaseError({
    code: "P0001",
    message: "E-mail autenticado indisponivel no token.",
  });
  const unconfirmedDatabaseEmail = mapFeedbackDatabaseError({
    code: "P0001",
    message: "E-mail autenticado e confirmado indisponivel.",
  });
  const concurrentEdit = mapFeedbackDatabaseError({
    code: "P0001",
    message: "FEEDBACK_CONFLICT",
  });
  const idempotencyConflict = mapFeedbackDatabaseError({
    code: "P0001",
    message: "FEEDBACK_IDEMPOTENCY_CONFLICT",
  });

  assert.equal(rateLimit.status, 429);
  assert.equal(validation.status, 400);
  assert.equal(internal.status, 500);
  assert.equal(missingJwtEmail.status, 401);
  assert.equal(unconfirmedDatabaseEmail.status, 403);
  assert.match(unconfirmedDatabaseEmail.publicMessage, /Confirme seu e-mail/);
  assert.equal(concurrentEdit.status, 409);
  assert.equal(idempotencyConflict.status, 409);
  assert.doesNotMatch(internal.publicMessage, /segredo-interno/);
});

test("templates escapam HTML e mantem assuntos de e-mail fixos", () => {
  const submission = buildFeedbackSubmissionEmail({
    notificationId: submissionNotificationId,
    feedback: {
      id: publicFeedbackRow.id,
      category: publicFeedbackRow.category,
      area: publicFeedbackRow.area,
      subject: "<script>assunto</script>",
      message: "Mensagem com <img src=x onerror=alert(1)>",
      pagePath: "/bipagem?<teste>",
      createdAt: publicFeedbackRow.created_at,
    },
    authenticatedUser: {
      email: publicFeedbackRow.sender_email,
    },
  });
  const response = buildFeedbackResponseEmail({
    notificationId: responseNotificationId,
    feedback: {
      id: publicFeedbackRow.id,
      subject: "<b>Assunto</b>",
      response: "Use <strong>este fluxo</strong>",
      senderEmail: publicFeedbackRow.sender_email,
    },
  });

  assert.equal(submission.subject, "Novo feedback no Sistema Despacho");
  assert.doesNotMatch(submission.html, /<script>|<img src=/);
  assert.match(submission.html, /&lt;script&gt;/);
  assert.equal(
    response.subject,
    "Atualizacao do seu feedback no Sistema Despacho",
  );
  assert.doesNotMatch(response.html, /<strong>este fluxo<\/strong>/);
  assert.match(response.html, /&lt;strong&gt;este fluxo&lt;\/strong&gt;/);
  assert.doesNotMatch(`${response.html}\n${response.text}`, /Status:/i);
});

test("Resend recebe varios destinatarios server-side, reply_to autenticado e chave estavel", async () => {
  const previousEnvironment = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RELATORIOS_EMAIL_FROM: process.env.RELATORIOS_EMAIL_FROM,
  };
  process.env.RESEND_API_KEY = "re_teste";
  process.env.RELATORIOS_EMAIL_FROM = "Sistema <sistema@example.com>";

  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  try {
    const result = await sendFeedbackSubmissionEmail(
      {
        notificationId: submissionNotificationId,
        feedback: {
          id: publicFeedbackRow.id,
          category: publicFeedbackRow.category,
          area: publicFeedbackRow.area,
          subject: publicFeedbackRow.subject,
          message: publicFeedbackRow.message,
          pagePath: publicFeedbackRow.page_path,
          createdAt: publicFeedbackRow.created_at,
        },
        authenticatedUser: {
          email: publicFeedbackRow.sender_email,
        },
      },
      [
        "proprietario@example.com",
        "operacao@example.com",
        "PROPRIETARIO@example.com",
      ],
      async (input, init) => {
        capturedUrl = String(input);
        capturedInit = init;
        return new Response(null, { status: 202 });
      },
    );

    assert.deepEqual(result, { sent: true });
    assert.equal(capturedUrl, "https://api.resend.com/emails");
    const body = JSON.parse(String(capturedInit?.body)) as Record<
      string,
      unknown
    >;
    const headers = capturedInit?.headers as Record<string, string>;
    assert.deepEqual(body.to, [
      "proprietario@example.com",
      "operacao@example.com",
    ]);
    assert.equal(body.from, "Sistema <sistema@example.com>");
    assert.equal(body.reply_to, publicFeedbackRow.sender_email);
    assert.equal(body.subject, "Novo feedback no Sistema Despacho");
    assert.equal(
      headers["Idempotency-Key"],
      createFeedbackSubmissionIdempotencyKey(submissionNotificationId),
    );
    assert.ok(headers["Idempotency-Key"].length <= 256);
    assert.ok(capturedInit?.signal);
  } finally {
    restoreEnvironment(previousEnvironment);
  }
});

test("destinatarios de feedback sao normalizados a partir do contexto persistido", () => {
  assert.deepEqual(
    normalizeFeedbackRecipientEmails([
      "um@example.com",
      "dois@example.com",
      "tres@example.com",
      "UM@example.com",
    ]),
    ["um@example.com", "dois@example.com", "tres@example.com"],
  );
  assert.equal(
    normalizeFeedbackRecipientEmails([
      "valido@example.com",
      "email-invalido",
    ]),
    null,
  );

  const fiftyRecipients = Array.from(
    { length: 50 },
    (_, index) => `gestor${index}@example.com`,
  );
  assert.equal(normalizeFeedbackRecipientEmails(fiftyRecipients)?.length, 50);
  assert.equal(
    normalizeFeedbackRecipientEmails([
      ...fiftyRecipients,
      "extra@example.com",
    ]),
    null,
  );
});

test("configuracao invalida de destinatarios nao chama o Resend", async () => {
  const previousEnvironment = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RELATORIOS_EMAIL_FROM: process.env.RELATORIOS_EMAIL_FROM,
  };
  process.env.RESEND_API_KEY = "re_teste";
  process.env.RELATORIOS_EMAIL_FROM = "Sistema <sistema@example.com>";
  let called = false;

  try {
    const result = await sendFeedbackSubmissionEmail(
      {
        notificationId: submissionNotificationId,
        feedback: {
          id: publicFeedbackRow.id,
          category: publicFeedbackRow.category,
          area: publicFeedbackRow.area,
          subject: publicFeedbackRow.subject,
          message: publicFeedbackRow.message,
          pagePath: publicFeedbackRow.page_path,
          createdAt: publicFeedbackRow.created_at,
        },
        authenticatedUser: { email: publicFeedbackRow.sender_email },
      },
      ["gestor@example.com", "endereco-invalido"],
      async () => {
        called = true;
        return new Response(null, { status: 202 });
      },
    );

    assert.deepEqual(result, { sent: false, reason: "invalid_recipient" });
    assert.equal(called, false);
  } finally {
    restoreEnvironment(previousEnvironment);
  }
});

test("lista vazia nao chama o Resend e informa notificacao nao configurada", async () => {
  const previousEnvironment = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RELATORIOS_EMAIL_FROM: process.env.RELATORIOS_EMAIL_FROM,
  };
  process.env.RESEND_API_KEY = "re_teste";
  process.env.RELATORIOS_EMAIL_FROM = "Sistema <sistema@example.com>";
  let called = false;

  try {
    const result = await sendFeedbackSubmissionEmail(
      {
        notificationId: submissionNotificationId,
        feedback: {
          id: publicFeedbackRow.id,
          category: publicFeedbackRow.category,
          area: publicFeedbackRow.area,
          subject: publicFeedbackRow.subject,
          message: publicFeedbackRow.message,
          pagePath: publicFeedbackRow.page_path,
          createdAt: publicFeedbackRow.created_at,
        },
        authenticatedUser: { email: publicFeedbackRow.sender_email },
      },
      [],
      async () => {
        called = true;
        return new Response(null, { status: 202 });
      },
    );

    assert.deepEqual(result, { sent: false, reason: "not_configured" });
    assert.equal(called, false);
  } finally {
    restoreEnvironment(previousEnvironment);
  }
});

test("chaves usam IDs persistentes de notificacao e ficam abaixo de 256 bytes", () => {
  const key = createFeedbackResponseIdempotencyKey(responseNotificationId);
  assert.equal(
    key,
    `feedback-response:${responseNotificationId}`,
  );
  assert.ok(key.length <= 256);
  assert.equal(
    createFeedbackSubmissionIdempotencyKey(submissionNotificationId),
    `feedback-submission:${submissionNotificationId}`,
  );
});

test("rotas separam autenticacao publica do estado interno de entrega", () => {
  assert.match(sharedSource, /createSupabaseClientForAccessToken\(token\)/);
  assert.match(sharedSource, /auth\.getUser\(token\)/);
  assert.match(sharedSource, /data\.user\.email_confirmed_at/);
  assert.match(sharedSource, /Confirme seu e-mail antes de usar o feedback/);
  assert.match(sharedSource, /request\.body\.getReader\(\)/);
  assert.match(sharedSource, /Promise\.race\(\[reader\.read\(\), deadline\]\)/);
  assert.match(sharedSource, /12_000/);
  assert.doesNotMatch(sharedSource, /request\.json\(\)/);
  assert.doesNotMatch(sharedSource, /reviewed_by/);

  assert.match(postRouteSource, /rpc\(\s*"submit_feedback"/);
  for (const parameter of [
    "p_submission_key",
    "p_category",
    "p_area",
    "p_subject",
    "p_message",
    "p_page_path",
  ]) {
    assert.match(postRouteSource, new RegExp(`\\b${parameter}\\b`));
  }
  assert.match(postRouteSource, /getFeedbackDeliveryClient\(\)/);
  assert.match(
    postRouteSource,
    /"get_feedback_submission_delivery_context_v2"/,
  );
  assert.match(postRouteSource, /p_user_id: authentication\.user\.id/);
  assert.match(
    postRouteSource,
    /notificationId: deliveryContext\.notificationId/,
  );
  assert.match(postRouteSource, /deliveryContext\.recipientEmails/);
  assert.doesNotMatch(postRouteSource, /recipientEmails\s*:/);
  assert.doesNotMatch(postRouteSource, /deliveryContext\s*[,}]/);
  assert.match(postRouteSource, /"mark_feedback_submission_notified"/);
  assert.match(postRouteSource, /p_notification_id/);
  assert.match(postRouteSource, /marked === true/);
  assert.match(postRouteSource, /notificationSent: notification\.sent/);
  assert.match(postRouteSource, /\{ status: 201 \}/);

  const reviewIndex = patchRouteSource.indexOf('"review_feedback"');
  const revalidationIndex = patchRouteSource.indexOf(
    '"get_feedback_response_notification_state"',
  );
  assert.ok(reviewIndex >= 0 && reviewIndex < revalidationIndex);
  assert.match(patchRouteSource, /p_response: review\.response/);
  assert.match(
    patchRouteSource,
    /p_expected_updated_at: review\.expectedUpdatedAt/,
  );
  assert.doesNotMatch(patchRouteSource, /p_admin_response/);
  assert.doesNotMatch(patchRouteSource, /previousResponse|select\("admin_response"\)/);
  assert.doesNotMatch(
    patchRouteSource,
    /\.select\("response_notification_id, response_notified_at"\)/,
  );
  assert.match(patchRouteSource, /"mark_feedback_response_notified"/);
  assert.match(
    patchRouteSource,
    /notificationId: currentNotification\.notificationId/,
  );
  assert.match(
    patchRouteSource,
    /subject: currentNotification\.subject/,
  );
  assert.match(
    patchRouteSource,
    /response: currentNotification\.responseText/,
  );
  assert.match(
    patchRouteSource,
    /senderEmail: currentNotification\.recipientEmail/,
  );
  assert.doesNotMatch(
    patchRouteSource,
    /subject: feedback\.subject|response: feedback\.admin_response|senderEmail: feedback\.sender_email/,
  );
  assert.match(patchRouteSource, /marked === true/);
  assert.match(patchRouteSource, /Feedback atualizado\./);
  assert.match(
    patchRouteSource,
    /Feedback atualizado e usuário notificado\./,
  );
  assert.match(
    patchRouteSource,
    /Feedback atualizado, mas o e-mail não foi enviado\./,
  );
});

test("segredos de entrega ficam em helper server-only e documentacao server-side", () => {
  assert.match(deliveryClientSource, /^import "server-only";/);
  assert.match(
    deliveryClientSource,
    /process\.env\.SUPABASE_SERVICE_ROLE_KEY/,
  );
  assert.match(deliveryClientSource, /createClient\(url, serviceRoleKey/);
  assert.doesNotMatch(deliveryClientSource, /console\.|NextResponse|JSON\.stringify/);
  assert.doesNotMatch(
    `${postRouteSource}\n${patchRouteSource}`,
    /SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey/,
  );
  assert.ok(packageJson.dependencies?.["server-only"]);

  assert.doesNotMatch(emailSource, /process\.env\.FEEDBACK_EMAIL_TO/);
  assert.match(emailSource, /process\.env\.RELATORIOS_EMAIL_FROM/);
  assert.match(emailSource, /process\.env\.RESEND_API_KEY/);
  assert.match(emailSource, /AbortSignal\.timeout\(FEEDBACK_EMAIL_TIMEOUT_MS\)/);
  assert.doesNotMatch(emailSource, /response\.text\(\)|response\.json\(\)/);
  assert.doesNotMatch(emailSource, /statusLabels|feedback\.status/);
  assert.match(envExample, /^SUPABASE_SERVICE_ROLE_KEY=$/m);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/);
  assert.match(readme, /POST \/api\/feedback/);
  assert.match(readme, /PATCH \/api\/feedback\/\[id\]/);
  assert.match(readme, /confirmação de e-mail habilitada/);
  assert.match(readme, /`SUPABASE_SERVICE_ROLE_KEY`/);
  assert.match(readme, /expectedUpdatedAt/);
  assert.doesNotMatch(readme, /RESEND_FROM_EMAIL=/);
});
