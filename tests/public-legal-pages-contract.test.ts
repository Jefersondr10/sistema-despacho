import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const shellSource = read("app/_components/app-shell.tsx");
const layoutSource = read("app/_components/legal-document-page.tsx");
const privacySource = read("app/privacidade/page.tsx");
const termsSource = read("app/termos/page.tsx");

test("privacidade e termos ignoram o shell autenticado", () => {
  assert.match(shellSource, /const PUBLIC_STANDALONE_ROUTES = new Set\(\[[\s\S]*"\/privacidade"[\s\S]*"\/termos"[\s\S]*\]\)/);
  assert.match(shellSource, /pathname === "\/demonstracao-bipagem" \|\|[\s\S]*PUBLIC_STANDALONE_ROUTES\.has\(pathname\)/);
  assert.ok(
    shellSource.indexOf("PUBLIC_STANDALONE_ROUTES.has(pathname)") <
      shellSource.lastIndexOf("<AuthenticatedAppShell>"),
  );
});

test("páginas legais são públicas e não dependem do cliente de autenticação", () => {
  for (const source of [layoutSource, privacySource, termsSource]) {
    assert.doesNotMatch(source, /useAuth|AuthProvider|supabaseClient|createClient/);
    assert.doesNotMatch(source, /["']use client["']/);
  }

  assert.match(privacySource, /export default function PrivacyPage/);
  assert.match(termsSource, /export default function TermsPage/);
  assert.match(layoutSource, /href="\/login"/);
  assert.match(layoutSource, /href="\/privacidade"/);
  assert.match(layoutSource, /href="\/termos"/);
});

test("política descreve o uso mínimo do Google e exclui outros produtos", () => {
  assert.match(privacySource, /somente seu nome,[\s\S]*endereço de e-mail e foto de perfil/);
  assert.match(privacySource, /autenticar você e criar ou vincular sua[\s\S]*conta/);
  assert.match(privacySource, /Não acessamos, lemos ou armazenamos mensagens do Gmail/);
  assert.match(privacySource, /Google Drive/);
  assert.match(privacySource, /Google Agenda\/Calendar/);
});

test("política cobre infraestrutura, retenção, segurança e direitos", () => {
  assert.match(privacySource, /backend próprio,[\s\S]*Hostinger/);
  assert.match(privacySource, /Supabase self-hosted/);
  assert.match(privacySource, /Não vendemos dados pessoais/);
  assert.match(privacySource, /Retenção e exclusão/);
  assert.match(privacySource, /conexão criptografada/);
  assert.match(privacySource, /Seus direitos/);
  assert.match(privacySource, /mailto:jefersondr10@gmail\.com/);
});

test("termos apresentam finalidade, responsabilidades e uso permitido", () => {
  assert.match(termsSource, /Finalidade do Sistema de Despacho/);
  assert.match(termsSource, /bipagem de pacotes/);
  assert.match(termsSource, /Permissões e responsabilidade da organização/);
  assert.match(termsSource, /Uso permitido/);
  assert.match(termsSource, /Suspensão e encerramento/);
  assert.match(termsSource, /href="\/privacidade"/);
  assert.match(termsSource, /mailto:jefersondr10@gmail\.com/);
});

test("as duas páginas expõem metadados próprios e data da versão", () => {
  assert.match(privacySource, /title: "Política de Privacidade \| Sistema de Despacho"/);
  assert.match(termsSource, /title: "Termos de Uso \| Sistema de Despacho"/);
  assert.match(layoutSource, /Última atualização: 3 de setembro de 2026\./);
});
