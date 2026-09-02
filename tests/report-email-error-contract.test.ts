import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(
  new URL("../app/api/relatorios/enviar-email/route.ts", import.meta.url),
  "utf8",
);
const resendSource = routeSource.match(
  /async function sendEmailWithResend[\s\S]*?(?=async function saveHistory)/,
)?.[0];

test("envio valida a permissão antes de chamar o provedor externo", () => {
  const permissionCheck = routeSource.indexOf(
    'authenticatedClient.rpc("current_account_has_permission",',
  );
  const providerCall = routeSource.indexOf("await sendEmailWithResend(");

  assert.ok(permissionCheck >= 0, "a rota deve consultar a permissão da conta");
  assert.ok(
    providerCall > permissionCheck,
    "a permissão deve ser validada antes do envio externo",
  );
  assert.match(routeSource, /p_permission: "relatorios\.send"/);
  assert.match(routeSource, /permissionError \|\| canSendReport !== true/);
  assert.match(routeSource, /status: 403/);
});

test("envio de relatório limita o tempo da chamada ao Resend", () => {
  assert.ok(resendSource, "função de envio não encontrada");
  assert.match(routeSource, /const RESEND_EMAIL_TIMEOUT_MS = 10_000/);
  assert.match(
    resendSource,
    /signal: AbortSignal\.timeout\(RESEND_EMAIL_TIMEOUT_MS\)/,
  );
  assert.match(routeSource, /error\.name === "TimeoutError"/);
  assert.match(routeSource, /error\.name === "AbortError"/);
});

test("falha do provedor não devolve corpo bruto nem destinatários ao cliente", () => {
  assert.ok(resendSource, "função de envio não encontrada");
  assert.doesNotMatch(resendSource, /response\.text\(\)/);
  assert.doesNotMatch(resendSource, /response\.json\(\)/);
  assert.doesNotMatch(resendSource, /response\.statusText/);
  assert.doesNotMatch(routeSource, /Falha no provedor de e-mail/);
  assert.match(
    resendSource,
    /logReportEmailFailure\(\{ kind: "provider", status: response\.status \}\)/,
  );
  assert.match(resendSource, /throw new EmailDeliveryError\(\)/);
});

test("cliente recebe mensagem amigável em português e diagnóstico fica seguro", () => {
  assert.match(
    routeSource,
    /Não foi possível enviar o relatório por e-mail agora\./,
  );
  assert.match(
    routeSource,
    /O envio por e-mail ainda não está configurado\./,
  );
  assert.match(
    routeSource,
    /type SafeEmailFailureDetails =[\s\S]*kind: "provider"; status: number[\s\S]*kind: "timeout" \| "network"/,
  );
  assert.match(
    routeSource,
    /console\.error\("Falha no envio de relatório por e-mail\.", details\)/,
  );
  assert.match(routeSource, /error instanceof EmailDeliveryError[\s\S]*\? 502/);
});
