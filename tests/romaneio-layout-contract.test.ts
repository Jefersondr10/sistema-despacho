import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const componentSource = read("app/_components/romaneio-document.tsx");
const emailSource = read("app/api/relatorios/enviar-email/route.ts");
const globalStyles = read("app/globals.css");

test("romaneio escolhe quatro ou cinco colunas e imprime em A4", () => {
  assert.match(componentSource, /return hasLongTrackingCode \? 4 : 5/);
  assert.match(componentSource, /data-columns=\{trackingColumnCount\}/);
  assert.match(
    globalStyles,
    /@page romaneio\s*\{[\s\S]*size:\s*A4 portrait;[\s\S]*margin:\s*10mm;/,
  );
  assert.match(globalStyles, /\.romaneio-document\s*\{\s*page:\s*romaneio;/);
  assert.match(
    globalStyles,
    /romaneio-tracking-grid\[data-columns="4"\][\s\S]*repeat\(4,/,
  );
  assert.match(
    globalStyles,
    /romaneio-tracking-grid\[data-columns="5"\][\s\S]*repeat\(5,/,
  );
});

test("loja e marketplace ficam em destaque sem metadados removidos", () => {
  assert.match(componentSource, />\s*Loja\s*</);
  assert.match(componentSource, />\s*Marketplace\s*</);
  assert.doesNotMatch(componentSource, /group\.tipo_operacao/);
  assert.doesNotMatch(componentSource, /group\.transportadora/);
  assert.doesNotMatch(componentSource, /group\.melhor_envio/);
});

test("romaneio do email segue o mesmo resumo e preserva as assinaturas", () => {
  const romaneioEmailSource = emailSource.match(
    /function buildRomaneioEmail[\s\S]*?(?=function buildReportEmail)/,
  )?.[0];

  assert.ok(romaneioEmailSource);
  assert.match(romaneioEmailSource, /Romaneio de Pacotes/);
  assert.match(romaneioEmailSource, /LOJA:/);
  assert.match(romaneioEmailSource, /MARKETPLACE:/);
  assert.doesNotMatch(romaneioEmailSource, /group\.tipo_operacao/);
  assert.doesNotMatch(romaneioEmailSource, /group\.transportadora/);
  assert.doesNotMatch(romaneioEmailSource, /group\.melhor_envio/);
  assert.match(romaneioEmailSource, /Transportadora: _+/);
  assert.match(romaneioEmailSource, /Responsável pela expedição: _+/);
});
