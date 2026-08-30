import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const adminPageSource = read("app/admin/feedback/page.tsx");
const employeePageSource = read("app/feedback/page.tsx");
const managerSource = read(
  "app/admin/feedback/feedback-notification-recipients.tsx",
);
const databaseSource = read("lib/database.ts");

test("cadastro de notificacoes não é exposto na interface", () => {
  assert.match(adminPageSource, /redirect\("\/feedback"\)/);
  assert.doesNotMatch(adminPageSource, /FeedbackNotificationRecipientsManager/);
  assert.doesNotMatch(employeePageSource, /NotificationRecipients|Destinatários/);
  assert.doesNotMatch(adminPageSource, /Gerenciar feedbacks/);
  assert.match(managerSource, /useFeedbackAdminAccess\(\)/);
  assert.match(managerSource, /adminAccessStatus === "allowed"/);
  assert.match(managerSource, /if \(!isAdmin\) return null/);
});

test("gerente pode cadastrar, editar, ativar e excluir destinatarios", () => {
  for (const helper of [
    "listFeedbackNotificationRecipients",
    "createFeedbackNotificationRecipient",
    "updateFeedbackNotificationRecipient",
    "deleteFeedbackNotificationRecipient",
  ]) {
    assert.match(managerSource, new RegExp(`${helper}\\(`));
    assert.match(databaseSource, new RegExp(`export async function ${helper}\\(`));
  }

  assert.match(managerSource, /Adicionar destinatário/);
  assert.match(managerSource, /Editar destinatário/);
  assert.match(managerSource, /recipient\.active \? "Desativar" : "Ativar"/);
  assert.match(managerSource, /Excluir definitivamente/);
  assert.match(managerSource, /<ConfirmDialog/);
  assert.match(databaseSource, /p_expected_updated_at: expectedUpdatedAt/);
});

test("formulario valida e-mail, nome e informa ausencia de destinatario ativo", () => {
  assert.match(managerSource, /function isValidEmail/);
  assert.match(managerSource, /maxLength=\{320\}/);
  assert.match(managerSource, /maxLength=\{120\}/);
  assert.match(managerSource, /Informe um e-mail válido/);
  assert.match(managerSource, /Este e-mail já está cadastrado/);
  assert.match(managerSource, /limite de 50 destinatários ativos/);
  assert.match(managerSource, /Nenhum destinatário está ativo/);
  assert.match(managerSource, /feedbacks continuarão sendo salvos/);
});

test("editor e responsivo, acessivel e protege alteracoes nao salvas", () => {
  assert.match(managerSource, /role="dialog"/);
  assert.match(managerSource, /aria-modal="true"/);
  assert.match(managerSource, /useAccessibleFullscreenDialog\(\{/);
  assert.match(managerSource, /min-h-dvh/);
  assert.match(managerSource, /safe-area-inset-bottom/);
  assert.match(managerSource, /Descartar as alterações ainda não salvas/);
  assert.match(managerSource, /aria-invalid=\{Boolean\(emailError\)\}/);
  assert.match(managerSource, /min-h-1[12]/);
});

test("perda de acesso limpa dados administrativos da memoria", () => {
  assert.match(managerSource, /if \(!isAdmin\) \{/);
  assert.match(managerSource, /requestRef\.current \+= 1/);
  assert.match(managerSource, /setItems\(\[\]\)/);
  assert.match(managerSource, /setEditor\(null\)/);
  assert.match(managerSource, /setDeleteTarget\(null\)/);
});
