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
  assert.match(noticeSource, /Acessos individuais/);
  assert.match(noticeSource, /Ações identificadas/);
  assert.match(noticeSource, /Controle de equipe/);
});
