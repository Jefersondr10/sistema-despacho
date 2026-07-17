import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultPackageFilters,
  filterCancellations,
  filterPackages,
  formatDateOnly,
  formatPackageDate,
  getSaoPauloDateString,
  getTodayDateString,
  type DispatchPackage,
  type PackageCancellation,
} from "../app/_lib/mock-data.ts";

const localDayReference = "2026-07-16T15:00:00.000Z";

function makePackage(
  id: string,
  dataHoraBipagem: string,
): DispatchPackage {
  return {
    id,
    lote_id: "lote-1",
    loja_id: "loja-brasilia",
    codigo_rastreio: `CODIGO-${id}`,
    marketplace: "Marketplace",
    melhor_envio: false,
    transportadora: null,
    tipo_operacao: "postagem",
    status: "Finalizado",
    data_hora_bipagem: dataHoraBipagem,
    criado_em: dataHoraBipagem,
  };
}

function makeCancellation(canceladoEm: string): PackageCancellation {
  return {
    id: "cancelamento-1",
    pacote_id: "pacote-1",
    loja_id: "loja-brasilia",
    loja_nome: "Brasília",
    sessao_id: "lote-1",
    codigo_pacote: "CODIGO-CANCELADO",
    marketplace: "Marketplace",
    tipo_operacao: "postagem",
    melhor_envio: false,
    transportadora: null,
    data_hora_bipagem: canceladoEm,
    cancelado_em: canceladoEm,
    justificativa_geral: "Teste",
    justificativa_individual: "",
    criado_em: canceladoEm,
  };
}

test("converte a virada UTC para o dia anterior em Sao Paulo", () => {
  const timestamp = "2026-07-17T02:01:00.000Z";

  assert.equal(getSaoPauloDateString(timestamp), "2026-07-16");
  assert.equal(getTodayDateString(timestamp), "2026-07-16");
  assert.equal(formatDateOnly("2026-07-16"), "16/07/2026");
  assert.match(formatPackageDate(timestamp), /16\/07\/2026.*23:01/);
});

test("inclui no Dia atual o pacote bipado as 23:01 de Brasilia", () => {
  const filters = createDefaultPackageFilters();
  const packageAt2301 = makePackage(
    "pacote-2301",
    "2026-07-17T02:01:00.000Z",
  );

  const filtered = filterPackages(
    [packageAt2301],
    filters,
    localDayReference,
  );

  assert.deepEqual(filtered.map((item) => item.id), ["pacote-2301"]);
});

test("mantem pacotes do restante do dia no filtro Dia atual", () => {
  const filters = createDefaultPackageFilters();
  const morningPackage = makePackage(
    "pacote-manha",
    "2026-07-16T12:30:00.000Z",
  );
  const afternoonPackage = makePackage(
    "pacote-tarde",
    "2026-07-16T19:45:00.000Z",
  );
  const nextLocalDayPackage = makePackage(
    "pacote-dia-seguinte",
    "2026-07-17T03:01:00.000Z",
  );

  const filtered = filterPackages(
    [morningPackage, afternoonPackage, nextLocalDayPackage],
    filters,
    localDayReference,
  );

  assert.deepEqual(
    filtered.map((item) => item.id),
    ["pacote-manha", "pacote-tarde"],
  );
});

test("filtra cancelamentos pelo dia local de Sao Paulo", () => {
  const filters = createDefaultPackageFilters();
  const cancellation = makeCancellation("2026-07-17T02:01:00.000Z");

  assert.equal(
    filterCancellations([cancellation], filters, localDayReference).length,
    1,
  );
});
