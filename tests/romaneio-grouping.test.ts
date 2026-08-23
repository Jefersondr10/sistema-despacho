import assert from "node:assert/strict";
import test from "node:test";

import type { DispatchPackage, Store } from "../app/_lib/mock-data.ts";
import { groupRomaneioPackagesByStoreAndMarketplace } from "../app/_lib/romaneio.ts";

const stores: Store[] = [
  {
    id: "loja-brasilia",
    name: "Brasília",
    document: "",
    city: "Brasília",
    status: "Ativa",
  },
  {
    id: "loja-sao-paulo",
    name: "São Paulo",
    document: "",
    city: "São Paulo",
    status: "Ativa",
  },
];

function makePackage({
  id,
  batchId,
  storeId,
  marketplaceId,
  marketplace,
  status = "Finalizado",
}: {
  id: string;
  batchId: string;
  storeId: string;
  marketplaceId?: string;
  marketplace: string;
  status?: DispatchPackage["status"];
}): DispatchPackage {
  return {
    id,
    lote_id: batchId,
    loja_id: storeId,
    marketplace_id: marketplaceId,
    codigo_rastreio: `RASTREIO-${id}`,
    marketplace,
    melhor_envio: false,
    transportadora: null,
    tipo_operacao: "postagem",
    status,
    data_hora_bipagem: "2026-08-18T15:00:00.000Z",
    criado_em: "2026-08-18T15:00:00.000Z",
  };
}

test("separa marketplaces e consolida lotes da mesma combinação", () => {
  const groups = groupRomaneioPackagesByStoreAndMarketplace(
    [
      makePackage({
        id: "bsb-lote-1",
        batchId: "lote-1",
        storeId: "loja-brasilia",
        marketplace: "Shopee",
      }),
      makePackage({
        id: "bsb-lote-2",
        batchId: "lote-2",
        storeId: "loja-brasilia",
        marketplace: "Amazon",
      }),
      makePackage({
        id: "bsb-lote-5",
        batchId: "lote-5",
        storeId: "loja-brasilia",
        marketplace: "Amazon",
      }),
      makePackage({
        id: "bsb-cancelado",
        batchId: "lote-3",
        storeId: "loja-brasilia",
        marketplace: "Amazon",
        status: "Cancelado",
      }),
      makePackage({
        id: "sp-lote-4",
        batchId: "lote-4",
        storeId: "loja-sao-paulo",
        marketplace: "Mercado Livre",
      }),
    ],
    stores,
    "Hoje (18/08/2026)",
  );

  assert.deepEqual(
    groups.map((group) => group.id),
    [
      "loja-brasilia::nome:amazon",
      "loja-brasilia::nome:shopee",
      "loja-sao-paulo::nome:mercado livre",
    ],
  );
  assert.equal(groups[0]?.loja_nome, "Brasília");
  assert.equal(groups[0]?.periodo, "Hoje (18/08/2026)");
  assert.equal(groups[0]?.marketplace, "Amazon");
  assert.deepEqual(
    groups[0]?.pacotes.map((item) => item.id),
    ["bsb-lote-2", "bsb-lote-5"],
  );
  assert.equal(groups[1]?.marketplace, "Shopee");
  assert.equal(groups[2]?.marketplace, "Mercado Livre");
});

test("usa loja_id como chave mesmo quando os nomes das lojas coincidem", () => {
  const duplicateNameStores: Store[] = stores.map((store) => ({
    ...store,
    name: "Centro",
  }));
  const groups = groupRomaneioPackagesByStoreAndMarketplace(
    [
      makePackage({
        id: "brasilia",
        batchId: "lote-1",
        storeId: "loja-brasilia",
        marketplace: "Amazon",
      }),
      makePackage({
        id: "sao-paulo",
        batchId: "lote-2",
        storeId: "loja-sao-paulo",
        marketplace: "Amazon",
      }),
    ],
    duplicateNameStores,
    "18/08/2026",
  );

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => [group.id, group.pacotes.length]),
    [
      ["loja-brasilia::nome:amazon", 1],
      ["loja-sao-paulo::nome:amazon", 1],
    ],
  );
});

test("normaliza marketplaces e oferece periodo seguro", () => {
  const groups = groupRomaneioPackagesByStoreAndMarketplace(
    [
      makePackage({
        id: "amazon-1",
        batchId: "lote-1",
        storeId: "loja-brasilia",
        marketplace: " Amazon ",
      }),
      makePackage({
        id: "amazon-2",
        batchId: "lote-2",
        storeId: "loja-brasilia",
        marketplace: "Amazon",
      }),
    ],
    stores,
    "   ",
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.marketplace, "Amazon");
  assert.equal(groups[0]?.periodo, "Não informado");
});

test("usa marketplace_id para separar catálogos com nomes iguais", () => {
  const groups = groupRomaneioPackagesByStoreAndMarketplace(
    [
      makePackage({
        id: "amazon-a",
        batchId: "lote-1",
        storeId: "loja-brasilia",
        marketplaceId: "market-a",
        marketplace: "Amazon",
      }),
      makePackage({
        id: "amazon-b",
        batchId: "lote-2",
        storeId: "loja-brasilia",
        marketplaceId: "market-b",
        marketplace: "Amazon",
      }),
    ],
    stores,
    "18/08/2026",
  );

  assert.deepEqual(
    groups.map((group) => group.id),
    ["loja-brasilia::id:market-a", "loja-brasilia::id:market-b"],
  );
});
