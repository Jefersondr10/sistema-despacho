import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const noticeSource = readFileSync(
  new URL("../app/_components/whats-new-notice.tsx", import.meta.url),
  "utf8",
);
const shellSource = readFileSync(
  new URL("../app/_components/authenticated-app-shell.tsx", import.meta.url),
  "utf8",
);

test("aviso aparece uma vez por versão neste aparelho", () => {
  assert.match(noticeSource, /export const CURRENT_RELEASE_ID = "[^"]+"/);
  assert.match(noticeSource, /"sistema-despacho-device:novidades-versao"/);
  assert.match(
    noticeSource,
    /window\.localStorage\.getItem\(RELEASE_NOTICE_STORAGE_KEY\)/,
  );
  assert.match(
    noticeSource,
    /window\.localStorage\.setItem\([\s\S]*RELEASE_NOTICE_STORAGE_KEY,[\s\S]*CURRENT_RELEASE_ID/,
  );
  assert.match(shellSource, /<WhatsNewNotice \/>/);
});

test("aviso abre apenas no Dashboard e nunca cobre a bipagem direta", () => {
  assert.match(noticeSource, /const pathname = usePathname\(\)/);
  assert.match(noticeSource, /const eligible = pathname === "\/dashboard"/);
  assert.match(noticeSource, /if \(!eligible\) return null/);
  assert.doesNotMatch(noticeSource, /pathname === "\/bipagem"/);
});

test("aviso usa diálogo nativo acessível e pode ser fechado pelo teclado", () => {
  assert.match(noticeSource, /dialog\.showModal\(\)/);
  assert.match(noticeSource, /aria-labelledby="whats-new-title"/);
  assert.match(noticeSource, /aria-describedby="whats-new-description"/);
  assert.match(noticeSource, /onCancel=\{\(event\) =>/);
  assert.match(noticeSource, /event\.preventDefault\(\)/);
  assert.match(noticeSource, /Entendi, continuar/);
});

test("conteúdo resume as mudanças visíveis desta versão", () => {
  assert.match(
    noticeSource,
    /CURRENT_RELEASE_ID = "2026-09-02-login-google"/,
  );
  assert.match(noticeSource, /Entrar ou criar conta com Google/);
  assert.match(noticeSource, /sem perder a opção de entrar com e-mail e senha/);
  assert.match(noticeSource, /Rastreios do Mercado Livre corrigidos/);
  assert.match(noticeSource, /Permissões sob medida/);
  assert.match(noticeSource, /Login individual/);
  assert.match(noticeSource, /Operação protegida/);
  assert.match(noticeSource, /marque exatamente quais áreas e ações/);
});
