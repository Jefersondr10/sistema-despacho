import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const bipagemSource = read("../app/bipagem/bipagem-form.tsx");
const reportsSource = read("../app/relatorios/relatorios-view.tsx");
const reportEmailRouteSource = read(
  "../app/api/relatorios/enviar-email/route.ts",
);
const catalogsSource = read("../app/cadastros/cadastros-view.tsx");

test("cancelamentos exigem a permissão específica na tela de bipagem", () => {
  assert.match(
    bipagemSource,
    /hasTeamPermission\([\s\S]*?"cancelamentos\.manage"/,
  );
  assert.match(
    bipagemSource,
    /function requestCancellationMode\(\)[\s\S]*?if \(!canManageCancellations\)/,
  );
  assert.match(
    bipagemSource,
    /async function confirmSessionPackageCancellation\(\)[\s\S]*?if \(!canManageCancellations\)/,
  );
  assert.match(
    bipagemSource,
    /\{canManageCancellations \? \([\s\S]*?Cancelar finalizados/,
  );
});

test("envio de relatório é ocultado e revalidado no servidor", () => {
  assert.match(
    reportsSource,
    /hasTeamPermission\(teamContext, "relatorios\.send"\)/,
  );
  assert.match(
    reportsSource,
    /if \(!canSendReports\)[\s\S]*?setRecipientsLoading\(false\)/,
  );
  assert.match(reportsSource, /\{canSendReports \? \([\s\S]*?Envio por e-mail/);
  assert.match(
    reportEmailRouteSource,
    /current_account_has_permission[\s\S]*?p_permission: "relatorios\.send"/,
  );
});

test("cadastros continuam consultáveis sem liberar alterações", () => {
  assert.match(
    catalogsSource,
    /hasTeamPermission\([\s\S]*?"cadastros\.manage"/,
  );
  assert.match(
    catalogsSource,
    /Seu acesso permite consultar, mas não alterar cadastros/,
  );
  assert.ok(
    [...catalogsSource.matchAll(/disabled=\{viewLoading \|\| !canManageCatalogs\}/g)]
      .length >= 4,
    "todas as seções de cadastro devem permanecer em modo somente consulta",
  );
  assert.match(
    catalogsSource,
    /async function runAction[\s\S]*?if \(!canManageCatalogs\)/,
  );
});
