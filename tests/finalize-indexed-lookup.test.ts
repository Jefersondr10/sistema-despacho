import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const directory = new URL("../supabase/migrations/", import.meta.url);
const filename = "202610070001_finalize_batch_indexed_lookup.sql";
const migration = readFileSync(new URL(filename, directory), "utf8");
const previous = readdirSync(directory).filter((file) => file < filename && file.endsWith(".sql")).sort()
  .map((file) => readFileSync(new URL(file, directory), "utf8")).join("\n");

function definitions(source: string, name: string) {
  return Array.from(source.matchAll(new RegExp(
    `create or replace function public\\.${name}\\s*\\([\\s\\S]*?as (\\$[a-z_]*\\$)([\\s\\S]*?)\\1\\s*;`, "gi",
  )));
}
function canonical(body: string) { return body.replace(/\s+/g, " ").trim(); }

test("margem de execucao limitada a RPC de finalizacao sem alterar roles", () => {
  const budget = readFileSync(new URL("202610070002_finalize_batch_request_budget.sql", directory), "utf8");
  assert.match(budget, /alter function public\.finalizar_sessao_bipagem\(uuid\)\s+set statement_timeout = '30s'/i);
  assert.doesNotMatch(budget, /alter (?:role|system|database)|statement_timeout\s*=\s*'?0/i);
  assert.match(budget, /notify pgrst, 'reload schema'/);
});

test("rastreio materializado permite indice sob RLS sem mudar codigos historicos", () => {
  assert.match(migration, /generated always as \(public\.normalizar_codigo_pacote\(codigo\)\) stored/i);
  assert.match(migration, /on public\.pacotes \(user_id, codigo_normalizado\)\s+where status <> 'cancelado'/i);
  assert.doesNotMatch(migration, /\b(?:disable row level security|security definer|grant|drop policy|alter policy)\b/i);
  assert.doesNotMatch(migration, /alter function[\s\S]*leakproof/i);
  assert.doesNotMatch(migration, /delete from|truncate|set codigo\s*=/i);
});

for (const name of ["finalizar_sessao_bipagem", "adicionar_item_sessao_bipagem_v3",
  "validar_unicidade_rastreio_item_pendente", "validar_unicidade_rastreio_pacote_ativo"]) {
  test(`${name}: unica mudanca no corpo e a consulta indexada`, () => {
    const before = definitions(previous, name).at(-1);
    const after = definitions(migration, name);
    assert.ok(before, `definicao anterior de ${name}`);
    assert.equal(after.length, 1);
    assert.equal(canonical(after[0][2]), canonical(before[2].replace(
      "public.normalizar_codigo_pacote(pacote.codigo)", "pacote.codigo_normalizado",
    )));
    assert.match(after[0][0], /security invoker/i);
    assert.match(after[0][2], /pg_advisory_xact_lock/);
    assert.match(after[0][2], /pacote\.codigo_normalizado/);
    assert.doesNotMatch(after[0][2], /normalizar_codigo_pacote\(pacote\.codigo\)/);
  });
}
