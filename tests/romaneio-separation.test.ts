import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getRomaneioGroupId } from "../app/_lib/romaneio-groups.ts";

const viewSource = readFileSync(
  new URL("../app/relatorios/relatorios-view.tsx", import.meta.url),
  "utf8",
);
const documentSource = readFileSync(
  new URL("../app/_components/romaneio-document.tsx", import.meta.url),
  "utf8",
);

test("loja ou marketplace diferentes nunca compartilham a mesma folha", () => {
  const base = {
    loteId: "lote-a",
    lojaId: "loja-a",
    marketplaceId: "market-a",
    marketplaceName: "Marketplace A",
  };

  const original = getRomaneioGroupId(base);
  assert.notEqual(
    original,
    getRomaneioGroupId({ ...base, lojaId: "loja-b" }),
  );
  assert.notEqual(
    original,
    getRomaneioGroupId({ ...base, marketplaceId: "market-b" }),
  );
});

test("dois lotes da mesma loja e marketplace continuam separados", () => {
  const identity = {
    lojaId: "loja-a",
    marketplaceId: "market-a",
    marketplaceName: "Marketplace A",
  };

  assert.notEqual(
    getRomaneioGroupId({ ...identity, loteId: "lote-a" }),
    getRomaneioGroupId({ ...identity, loteId: "lote-b" }),
  );
});

test("relatório ordena e imprime cada identidade em uma página", () => {
  assert.match(
    viewSource,
    /getRomaneioGroupId\(\{[\s\S]*loteId,[\s\S]*lojaId: item\.loja_id,[\s\S]*marketplaceId/,
  );
  assert.match(
    viewSource,
    /first\.loja_nome\.localeCompare\(second\.loja_nome,[\s\S]*first\.marketplace\.localeCompare/,
  );
  assert.match(documentSource, /data-loja-id=\{group\.loja_id\}/);
  assert.match(
    documentSource,
    /data-marketplace-id=\{group\.marketplace_id \?\? undefined\}/,
  );
  assert.match(documentSource, /romaneio-page-break/);
  assert.match(
    viewSource,
    /Cada lote, loja e marketplace em uma folha separada/,
  );
});
