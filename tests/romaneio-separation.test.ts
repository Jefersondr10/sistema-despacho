import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { DispatchPackage, Store } from "../app/_lib/mock-data.ts";
import { groupRomaneioPackagesByStoreAndMarketplace } from "../app/_lib/romaneio.ts";

const viewSource = readFileSync(
  new URL("../app/relatorios/relatorios-view.tsx", import.meta.url),
  "utf8",
);
const documentSource = readFileSync(
  new URL("../app/_components/romaneio-document.tsx", import.meta.url),
  "utf8",
);

const stores: Store[] = [
  {
    id: "loja-a",
    name: "Loja A",
    document: "",
    city: "",
    status: "Ativa",
  },
  {
    id: "loja-b",
    name: "Loja B",
    document: "",
    city: "",
    status: "Ativa",
  },
];

function makePackage({
  id,
  loteId,
  lojaId,
  marketplaceId,
  marketplace,
}: {
  id: string;
  loteId: string;
  lojaId: string;
  marketplaceId: string;
  marketplace: string;
}): DispatchPackage {
  return {
    id,
    lote_id: loteId,
    loja_id: lojaId,
    marketplace_id: marketplaceId,
    codigo_rastreio: `RASTREIO-${id}`,
    marketplace,
    melhor_envio: false,
    transportadora: null,
    tipo_operacao: "postagem",
    status: "Finalizado",
    data_hora_bipagem: "2026-08-23T12:00:00.000Z",
    criado_em: "2026-08-23T12:00:00.000Z",
  };
}

test("loja ou marketplace diferentes nunca compartilham a mesma folha", () => {
  const groups = groupRomaneioPackagesByStoreAndMarketplace(
    [
      makePackage({
        id: "a-1",
        loteId: "lote-a",
        lojaId: "loja-a",
        marketplaceId: "market-a",
        marketplace: "Marketplace A",
      }),
      makePackage({
        id: "a-2",
        loteId: "lote-b",
        lojaId: "loja-a",
        marketplaceId: "market-b",
        marketplace: "Marketplace B",
      }),
      makePackage({
        id: "b-1",
        loteId: "lote-c",
        lojaId: "loja-b",
        marketplaceId: "market-a",
        marketplace: "Marketplace A",
      }),
    ],
    stores,
    "23/08/2026",
  );

  assert.equal(groups.length, 3);
  assert.equal(new Set(groups.map((group) => group.id)).size, 3);
});

test("dois lotes da mesma loja e marketplace viram um romaneio do período", () => {
  const groups = groupRomaneioPackagesByStoreAndMarketplace(
    [
      makePackage({
        id: "lote-a-pacote",
        loteId: "lote-a",
        lojaId: "loja-a",
        marketplaceId: "market-a",
        marketplace: "Marketplace A",
      }),
      makePackage({
        id: "lote-b-pacote",
        loteId: "lote-b",
        lojaId: "loja-a",
        marketplaceId: "market-a",
        marketplace: "Marketplace A",
      }),
    ],
    stores,
    "23/08/2026",
  );

  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0]?.pacotes.map((item) => item.lote_id),
    ["lote-a", "lote-b"],
  );
});

test("relatório identifica e imprime cada combinação em uma página", () => {
  assert.match(viewSource, /groupRomaneioPackagesByStoreAndMarketplace/);
  assert.match(documentSource, /data-loja-id=\{group\.loja_id\}/);
  assert.match(
    documentSource,
    /data-marketplace-id=\{group\.marketplace_id \?\? undefined\}/,
  );
  assert.match(documentSource, /romaneio-page-break/);
  assert.match(
    viewSource,
    /Cada combinação de loja e marketplace em uma folha separada/,
  );
});
