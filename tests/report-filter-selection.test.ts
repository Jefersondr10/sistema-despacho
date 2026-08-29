import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createDefaultPackageFilters,
  filterPackages,
  type DispatchPackage,
} from "../app/_lib/mock-data.ts";
import {
  resolveMultiSelectValues,
  toggleAllMultiSelectValues,
  toggleMultiSelectValue,
} from "../app/_lib/multi-select-filter.ts";

const filterSource = readFileSync(
  new URL("../app/_components/package-filters.tsx", import.meta.url),
  "utf8",
);
const reportSource = readFileSync(
  new URL("../app/relatorios/relatorios-view.tsx", import.meta.url),
  "utf8",
);

const optionValues = ["opcao-a", "opcao-b"];

function makePackage(): DispatchPackage {
  return {
    id: "pacote-1",
    lote_id: "lote-1",
    loja_id: "loja-1",
    codigo_rastreio: "RASTREIO-1",
    marketplace_id: "marketplace-1",
    marketplace: "Marketplace 1",
    melhor_envio: false,
    transportadora: "Transportadora 1",
    tipo_operacao: "postagem",
    status: "Finalizado",
    data_hora_bipagem: "2026-08-29T12:00:00.000Z",
    criado_em: "2026-08-29T12:00:00.000Z",
  };
}

test("Selecionar tudo alterna entre todas e nenhuma opção", () => {
  const none = toggleAllMultiSelectValues({
    selected: [],
    optionValues,
    explicitlyEmpty: false,
  });

  assert.deepEqual(none, { selected: [], explicitlyEmpty: true });
  assert.deepEqual(
    resolveMultiSelectValues({ ...none, optionValues }).selectedValues,
    [],
  );

  const all = toggleAllMultiSelectValues({ ...none, optionValues });

  assert.deepEqual(all, { selected: [], explicitlyEmpty: false });
  assert.deepEqual(
    resolveMultiSelectValues({ ...all, optionValues }).selectedValues,
    optionValues,
  );
});

test("Selecionar tudo completa seleção parcial e itens podem chegar a nenhuma", () => {
  const allFromPartial = toggleAllMultiSelectValues({
    selected: ["opcao-a"],
    optionValues,
    explicitlyEmpty: false,
  });

  assert.deepEqual(allFromPartial, {
    selected: [],
    explicitlyEmpty: false,
  });

  const onlyB = toggleMultiSelectValue({
    selected: [],
    optionValues,
    explicitlyEmpty: false,
    value: "opcao-a",
  });
  assert.deepEqual(onlyB, {
    selected: ["opcao-b"],
    explicitlyEmpty: false,
  });

  const none = toggleMultiSelectValue({
    ...onlyB,
    optionValues,
    value: "opcao-b",
  });
  assert.deepEqual(none, { selected: [], explicitlyEmpty: true });
});

test("estado nenhum realmente zera o relatório em cada filtro múltiplo", () => {
  const item = makePackage();
  const defaults = {
    ...createDefaultPackageFilters(),
    dateMode: "all" as const,
  };

  assert.equal(filterPackages([item], defaults).length, 1);

  for (const name of [
    "lojaId",
    "marketplace",
    "transportadora",
  ] as const) {
    assert.equal(
      filterPackages([item], {
        ...defaults,
        emptyMultiSelections: [name],
      }).length,
      0,
      `${name} deveria excluir todos os pacotes`,
    );
  }
});

test("seletor comunica ação, resumo vazio e controles acessíveis", () => {
  assert.match(
    filterSource,
    /allSelected \? "Desmarcar tudo" : "Selecionar tudo"/,
  );
  assert.match(filterSource, /emptyLabel="Nenhuma"/);
  assert.match(filterSource, /emptyLabel="Nenhum"/);
  assert.match(filterSource, /aria-controls=\{dropdownId\}/);
  assert.match(filterSource, /role="group"/);
  assert.match(filterSource, /event\.key === "Escape"/);
  assert.match(reportSource, /hasEmptyMultiSelection\(filters, "lojaId"\)/);
  assert.match(reportSource, /\? "Nenhuma"/);
  assert.match(reportSource, /"Nenhum"/);
});
