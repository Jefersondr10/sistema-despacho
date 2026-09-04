import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  findOperationDefault,
  getOperationDefault,
} from "../app/bipagem/operation-defaults.ts";

const formSource = readFileSync("app/bipagem/bipagem-form.tsx", "utf8");
const catalogsSource = readFileSync("app/cadastros/cadastros-view.tsx", "utf8");
const storeSource = readFileSync("app/_lib/supabase-dispatch-store.ts", "utf8");
const databaseSource = readFileSync("lib/database.ts", "utf8");

const rules = [
  {
    id: "rule-amazon",
    user_id: "account-a",
    loja_id: "hd",
    marketplace_id: "amazon",
    tipo_operacao: "coleta" as const,
    criado_por: null,
    atualizado_por: null,
    created_at: "2026-09-03T00:00:00.000Z",
    updated_at: "2026-09-03T00:00:00.000Z",
  },
  {
    id: "rule-mercado-livre",
    user_id: "account-a",
    loja_id: "hd",
    marketplace_id: "mercado-livre",
    tipo_operacao: "postagem" as const,
    criado_por: null,
    atualizado_por: null,
    created_at: "2026-09-03T00:00:00.000Z",
    updated_at: "2026-09-03T00:00:00.000Z",
  },
];

test("a mesma loja pode ter operações diferentes por marketplace", () => {
  assert.equal(getOperationDefault(rules, "hd", "amazon"), "coleta");
  assert.equal(getOperationDefault(rules, "hd", "mercado-livre"), "postagem");
  assert.equal(getOperationDefault(rules, "hd", "shopee"), "");
  assert.equal(findOperationDefault(rules, "", "amazon"), null);
});

test("bipagem carrega regras só no perfil necessário e preserva lote aberto", () => {
  assert.match(storeSource, /const loadOperationRules = profile === "bipagem"/);
  assert.match(storeSource, /getRegrasOperacaoBipagem\(databaseContext\)/);
  assert.match(formSource, /function handleLojaChange/);
  assert.match(formSource, /function handleMarketplaceChange/);
  assert.match(formSource, /function applyOperationDefaultForCombination/);
  assert.match(formSource, /setTipoOperacao\(""\)/);
  assert.match(formSource, /if \(configLocked \|\| nextLojaId === lojaId\) return/);
  assert.match(formSource, /setTipoOperacao\(rule\.tipo_operacao\)/);
  assert.match(formSource, /operationSelectionSourceRef\.current = "none";[\s\S]*setActiveBatchId\(sessao\.id\)/);
  assert.match(formSource, /selecionada automaticamente/);
  assert.match(formSource, /Alterado manualmente/);
});

test("cadastros permite salvar, editar e excluir combinações", () => {
  assert.match(catalogsSource, /Regras de coleta e postagem/);
  assert.match(catalogsSource, /Salvar combinação/);
  assert.match(catalogsSource, /Combinações cadastradas/);
  assert.match(catalogsSource, /salvarRegraOperacaoBipagem/);
  assert.match(catalogsSource, /excluirRegraOperacaoBipagem/);
  assert.match(catalogsSource, /A escolha voltará a ser manual/);
  assert.match(databaseSource, /export async function getRegrasOperacaoBipagem/);
  assert.match(databaseSource, /export async function salvarRegraOperacaoBipagem/);
  assert.match(databaseSource, /export async function excluirRegraOperacaoBipagem/);
});
