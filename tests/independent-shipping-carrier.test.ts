import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultPackageFilters,
  filterPackages,
  getReportSummary,
  type DispatchPackage,
} from "../app/_lib/mock-data.ts";

function packageWith(
  id: string,
  transportadora: string | null,
  melhor_envio = false,
  loja_id = "loja-1",
): DispatchPackage {
  return {
    id,
    lote_id: `lote-${id}`,
    loja_id,
    codigo_rastreio: `RASTREIO-${id}`,
    marketplace: "Amazon",
    melhor_envio,
    transportadora,
    tipo_operacao: "coleta",
    status: "Finalizado",
    data_hora_bipagem: "2026-09-29T12:00:00.000Z",
    criado_em: "2026-09-29T12:00:00.000Z",
  };
}

test("resumo mantém transportadoras distintas sem Melhor Envio e totais por loja", () => {
  const summary = getReportSummary([
    packageWith("1", "Correios"),
    packageWith("2", "Correios"),
    packageWith("3", "Correios", false, "loja-2"),
    packageWith("4", "Loggi"),
    packageWith("5", null),
    packageWith("6", "Correios", true),
  ]);

  assert.equal(summary.length, 4);
  assert.equal(summary.reduce((total, group) => total + group.packages, 0), 6);
  const direct = summary.find((group) => group.transportadora === "Correios" && !group.melhor_envio)!;
  assert.equal(direct.packages, 3);
  assert.match(direct.label, /Correios/);
  assert.deepEqual(direct.lojas.map((store) => [store.loja_id, store.packages]), [
    ["loja-1", 2], ["loja-2", 1],
  ]);
  assert.equal(summary.find((group) => group.transportadora === "Loggi")?.packages, 1);
  assert.equal(summary.find((group) => group.transportadora === null)?.packages, 1);
  assert.equal(summary.find((group) => group.melhor_envio)?.packages, 1);
});

test("filtro de transportadora funciona independentemente do Melhor Envio", () => {
  const packages = [
    packageWith("1", "Correios"),
    packageWith("2", "Loggi"),
    packageWith("3", null),
    packageWith("4", "Correios", true),
  ];
  const filters = {
    ...createDefaultPackageFilters(),
    dateMode: "all" as const,
    transportadora: ["Correios"],
  };
  assert.deepEqual(filterPackages(packages, filters).map((item) => item.id), ["1", "4"]);
  assert.deepEqual(filterPackages(packages, { ...filters, melhorEnvio: "nao" }).map((item) => item.id), ["1"]);
  assert.deepEqual(filterPackages(packages, { ...filters, melhorEnvio: "sim" }).map((item) => item.id), ["4"]);
});
