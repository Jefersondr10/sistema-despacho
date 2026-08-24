import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultPackageFilters,
  filterPackages,
  type DispatchPackage,
  type Store,
} from "../app/_lib/mock-data.ts";
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
    codigo_rastreio: `RASTREIO-${id}`,
    marketplace_id: marketplaceId,
    marketplace,
    melhor_envio: false,
    transportadora: null,
    tipo_operacao: "postagem",
    status,
    data_hora_bipagem: "2026-08-18T15:00:00.000Z",
    criado_em: "2026-08-18T15:00:00.000Z",
  };
}

test("consolida lotes da mesma loja e marketplace sem misturar marketplaces", () => {
  const groups = groupRomaneioPackagesByStoreAndMarketplace(
    [
      makePackage({
        id: "bsb-amazon-lote-1",
        batchId: "lote-1",
        storeId: "loja-brasilia",
        marketplace: "Amazon",
      }),
      makePackage({
        id: "bsb-amazon-lote-2",
        batchId: "lote-2",
        storeId: "loja-brasilia",
        marketplace: "Amazon",
      }),
      makePackage({
        id: "bsb-shopee-lote-3",
        batchId: "lote-3",
        storeId: "loja-brasilia",
        marketplace: "Shopee",
      }),
      makePackage({
        id: "bsb-cancelado",
        batchId: "lote-4",
        storeId: "loja-brasilia",
        marketplace: "Amazon",
        status: "Cancelado",
      }),
      makePackage({
        id: "sp-lote-5",
        batchId: "lote-5",
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
  assert.equal(groups.length, 3);
  assert.equal(groups[0]?.loja_nome, "Brasília");
  assert.equal(groups[0]?.periodo, "Hoje (18/08/2026)");
  assert.equal(groups[0]?.marketplace, "Amazon");
  assert.deepEqual(
    groups[0]?.pacotes.map((item) => item.id),
    ["bsb-amazon-lote-1", "bsb-amazon-lote-2"],
  );
  assert.deepEqual(
    groups.map((group) => [group.loja_id, group.marketplace]),
    [
      ["loja-brasilia", "Amazon"],
      ["loja-brasilia", "Shopee"],
      ["loja-sao-paulo", "Mercado Livre"],
    ],
  );
  assert.equal(new Set(groups.map((group) => group.id)).size, 3);
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

test("usa marketplace_id para consolidar o mesmo cadastro e oferece período seguro", () => {
  const groups = groupRomaneioPackagesByStoreAndMarketplace(
    [
      makePackage({
        id: "amazon-1",
        batchId: "lote-1",
        storeId: "loja-brasilia",
        marketplaceId: "marketplace-amazon",
        marketplace: " Amazon ",
      }),
      makePackage({
        id: "amazon-2",
        batchId: "lote-2",
        storeId: "loja-brasilia",
        marketplaceId: "marketplace-amazon",
        marketplace: "amazon",
      }),
      makePackage({
        id: "amazon-3",
        batchId: "lote-3",
        storeId: "loja-brasilia",
        marketplaceId: "marketplace-amazon",
        marketplace: "AMAZON",
      }),
    ],
    stores,
    "   ",
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.marketplace, "Amazon");
  assert.equal(groups[0]?.pacotes.length, 3);
  assert.equal(groups[0]?.periodo, "Não informado");
});

test("normaliza nome apenas como fallback quando marketplace_id não existe", () => {
  const packages = [
    makePackage({
      id: "amazon-legado-1",
      batchId: "lote-1",
      storeId: "loja-brasilia",
      marketplace: " Amazon ",
    }),
    makePackage({
      id: "amazon-legado-2",
      batchId: "lote-2",
      storeId: "loja-brasilia",
      marketplace: "amazon",
    }),
  ];
  const groups = groupRomaneioPackagesByStoreAndMarketplace(
    packages,
    stores,
    "18/08/2026",
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.pacotes.length, 2);
  assert.deepEqual(
    filterPackages(packages, {
      ...createDefaultPackageFilters(),
      dateMode: "all",
      marketplace: ["AMAZON"],
    }).map((item) => item.id),
    ["amazon-legado-1", "amazon-legado-2"],
  );
});

test("não mistura cadastros distintos que tenham o mesmo nome", () => {
  const groups = groupRomaneioPackagesByStoreAndMarketplace(
    [
      makePackage({
        id: "amazon-a",
        batchId: "lote-1",
        storeId: "loja-brasilia",
        marketplaceId: "marketplace-amazon-a",
        marketplace: "Amazon",
      }),
      makePackage({
        id: "amazon-b",
        batchId: "lote-2",
        storeId: "loja-brasilia",
        marketplaceId: "marketplace-amazon-b",
        marketplace: "Amazon",
      }),
    ],
    stores,
    "18/08/2026",
  );

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => group.marketplace_id),
    ["marketplace-amazon-a", "marketplace-amazon-b"],
  );
});

test("mantém marketplace não informado separado dos marketplaces nomeados", () => {
  const groups = groupRomaneioPackagesByStoreAndMarketplace(
    [
      makePackage({
        id: "sem-marketplace-1",
        batchId: "lote-1",
        storeId: "loja-brasilia",
        marketplace: "",
      }),
      makePackage({
        id: "sem-marketplace-2",
        batchId: "lote-2",
        storeId: "loja-brasilia",
        marketplace: "   ",
      }),
      makePackage({
        id: "amazon",
        batchId: "lote-3",
        storeId: "loja-brasilia",
        marketplaceId: "marketplace-amazon",
        marketplace: "Amazon",
      }),
      makePackage({
        id: "nao-informado-real",
        batchId: "lote-4",
        storeId: "loja-brasilia",
        marketplaceId: "marketplace-nao-informado",
        marketplace: "Não informado",
      }),
    ],
    stores,
    "18/08/2026",
  );

  assert.equal(groups.length, 3);
  assert.equal(
    groups.find((group) => group.marketplace_id === null)?.pacotes.length,
    2,
  );
  assert.equal(
    groups.find((group) => group.marketplace === "Amazon")?.pacotes.length,
    1,
  );
  assert.equal(
    groups.find(
      (group) => group.marketplace_id === "marketplace-nao-informado",
    )?.pacotes.length,
    1,
  );
});

test("filtro do histórico usa marketplace_id e preserva marketplace vazio", () => {
  const packages = [
    makePackage({
      id: "amazon-a",
      batchId: "lote-1",
      storeId: "loja-brasilia",
      marketplaceId: "marketplace-amazon-a",
      marketplace: "Amazon renomeada",
    }),
    makePackage({
      id: "amazon-b",
      batchId: "lote-2",
      storeId: "loja-brasilia",
      marketplaceId: "marketplace-amazon-b",
      marketplace: "Amazon",
    }),
    makePackage({
      id: "sem-marketplace-1",
      batchId: "lote-3",
      storeId: "loja-brasilia",
      marketplace: "",
    }),
    makePackage({
      id: "sem-marketplace-2",
      batchId: "lote-4",
      storeId: "loja-brasilia",
      marketplace: "   ",
    }),
  ];
  const defaults = createDefaultPackageFilters();

  assert.deepEqual(
    filterPackages(packages, {
      ...defaults,
      dateMode: "all",
      marketplaceId: "marketplace-amazon-a",
      marketplace: ["Amazon antigo"],
    }).map((item) => item.id),
    ["amazon-a"],
  );
  assert.deepEqual(
    filterPackages(packages, {
      ...defaults,
      dateMode: "all",
      marketplace: [""],
    }).map((item) => item.id),
    ["sem-marketplace-1", "sem-marketplace-2"],
  );
});
