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

test("loja, marketplace e período ficam em destaque sem lote", () => {
  assert.match(componentSource, />\s*Loja\s*</);
  assert.match(componentSource, />\s*Marketplace\s*</);
  assert.match(componentSource, />\s*Período\s*</);
  assert.match(
    componentSource,
    /romaneio-store-name[^"\n]*place-items-center[^"\n]*text-center/,
  );
  assert.match(componentSource, /group\.marketplace/);
  assert.doesNotMatch(componentSource, /group\.marketplaces/);
  assert.match(componentSource, /group\.periodo/);
  assert.doesNotMatch(componentSource, /codigo_lote|>\s*Lote\s*</i);
});

test("marketplace fica centralizado e usa marca local com fallback textual", () => {
  const brandComponentSource = read(
    "app/_components/marketplace-brand-mark.tsx",
  );

  assert.match(
    componentSource,
    /romaneio-marketplace-mark[^"\n]*items-center[^"\n]*justify-center[^"\n]*text-center/,
  );
  assert.match(
    componentSource,
    /<MarketplaceBrandMark name=\{group\.marketplace\} \/>/,
  );
  assert.match(brandComponentSource, /role="img"/);
  assert.match(brandComponentSource, /aria-label=\{`\$\{label\}, marketplace`\}/);
  assert.match(brandComponentSource, /if \(brand === "amazon"\)/);
  assert.match(brandComponentSource, /if \(brand === "mercado-livre"\)/);
  assert.match(brandComponentSource, /if \(brand === "shopee"\)/);
  assert.match(brandComponentSource, />\s*\{label\}\s*<\/span>/);
});

test("impressão não leva o aviso do navegador nem um bloco vazio ao final", () => {
  const reportViewSource = read("app/relatorios/relatorios-view.tsx");

  assert.match(
    reportViewSource,
    /mode !== "romaneio" \? \([\s\S]*?className="no-print[^\"]*"[\s\S]*?PDF via navegador/,
  );
  assert.doesNotMatch(
    componentSource,
    /<div className="romaneio-page-break"\s*\/>/,
  );
  assert.match(
    componentSource,
    /className=\{groupIndex > 0 \? "romaneio-page-break" : undefined\}/,
  );
  assert.match(
    globalStyles,
    /\.romaneio-page-break\s*\{[\s\S]*break-before:\s*page;[\s\S]*page-break-before:\s*always;/,
  );
  assert.doesNotMatch(
    globalStyles,
    /\.romaneio-page-break\s*\{[\s\S]*?break-after:\s*page;/,
  );
});

test("romaneio do email segue o mesmo resumo e preserva as assinaturas", () => {
  const romaneioEmailSource = emailSource.match(
    /function buildRomaneioEmail[\s\S]*?(?=function buildReportEmail)/,
  )?.[0];

  assert.ok(romaneioEmailSource);
  assert.match(romaneioEmailSource, /Romaneio de Pacotes/);
  assert.match(romaneioEmailSource, /LOJA:/);
  assert.match(romaneioEmailSource, /MARKETPLACE:/);
  assert.match(romaneioEmailSource, /PERÍODO/);
  assert.match(
    romaneioEmailSource,
    /groups\.length === 1 \? "romaneio" : "romaneios"/,
  );
  assert.match(
    romaneioEmailSource,
    /class="romaneio-store-name"[^>]*text-align: center;/,
  );
  assert.doesNotMatch(romaneioEmailSource, /codigo_lote|\blotes?\b/i);
  assert.doesNotMatch(romaneioEmailSource, /group\.data\b/);
  assert.match(romaneioEmailSource, /group\.marketplace\b/);
  assert.doesNotMatch(romaneioEmailSource, /group\.marketplaces\b/);
  assert.match(romaneioEmailSource, /Transportadora: _+/);
  assert.match(romaneioEmailSource, /Responsável pela expedição: _+/);
});

test("email rejeita aba antiga que ainda mistura marketplaces", () => {
  assert.match(emailSource, /legacyMarketplaces\.length > 1/);
  assert.match(emailSource, /throw new ReportPayloadError/);
  assert.match(emailSource, /Recarregue a página para separar os marketplaces/);
  assert.match(emailSource, /error instanceof ReportPayloadError/);
  assert.match(emailSource, /status: 409/);
});
