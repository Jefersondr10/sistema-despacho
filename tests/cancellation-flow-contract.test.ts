import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const databaseSource = read("lib/database.ts");
const bipagemSource = read("app/bipagem/bipagem-form.tsx");
const migrationSource = read(
  "supabase/migrations/202608130001_cancelamento_sem_loja.sql",
);

test("busca de cancelamento percorre a conta sem exigir loja e trata ambiguidade", () => {
  assert.match(
    databaseSource,
    /export async function getPacotesFinalizadosPorCodigo[\s\S]*buscar_pacotes_finalizados_normalizado/,
  );
  assert.match(migrationSource, /pacote\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migrationSource, /pacote\.status = 'finalizado'/);
  assert.doesNotMatch(
    bipagemSource,
    /Selecione a loja dos pacotes antes de bipar/,
  );
  assert.match(bipagemSource, /matches\.length > 1/);
  assert.match(bipagemSource, /Nenhuma opção será escolhida\s+automaticamente/);
  assert.match(bipagemSource, /getCatalogStoreName\(candidate\.loja_id\)/);
  assert.match(bipagemSource, /candidate\.marketplace/);
  assert.match(
    bipagemSource,
    /checkingPackage \|\|\s*cancellationCandidates\.length > 0/,
  );
  assert.match(bipagemSource, /firstCancellationCandidateRef\.current\?\.focus/);
});

test("cancelamento em lote exige motivo geral apenas ao finalizar", () => {
  const scanSource = bipagemSource.match(
    /async function cancelPackageByCode[\s\S]*?(?=function addPendingCancellation)/,
  )?.[0];
  const finishSource = bipagemSource.match(
    /async function finalizePendingCancellations[\s\S]*?(?=function cancelSessionPackage)/,
  )?.[0];

  assert.ok(scanSource);
  assert.ok(finishSource);
  assert.doesNotMatch(scanSource, /cancellationReason\.trim/);
  assert.match(finishSource, /cancellationReason\.trim/);
  assert.match(bipagemSource, /Justificativa somente deste pacote \(opcional\)/);
  assert.match(
    migrationSource,
    /v_justificativa_aplicada :=\s*coalesce\(v_justificativa_individual, v_justificativa_geral\)/,
  );
});

test("RPC v2 e fallback preservam atomicidade e isolamento", () => {
  assert.match(migrationSource, /begin;[\s\S]*commit;/);
  assert.match(migrationSource, /v_user_id uuid := public\.exigir_usuario_autenticado\(\)/);
  assert.match(migrationSource, /for update;/);
  assert.match(migrationSource, /and user_id = v_user_id/);
  assert.match(
    migrationSource,
    /revoke execute on function public\.finalizar_cancelamentos_lote_v2\(text, jsonb\)[\s\S]*from public, anon/,
  );
  assert.match(
    migrationSource,
    /grant execute on function public\.finalizar_cancelamentos_lote_v2\(text, jsonb\)[\s\S]*to authenticated/,
  );
  assert.match(databaseSource, /finalizar_cancelamentos_lote_v2/);
  assert.match(databaseSource, /isMissingRpcFunctionError\(result\.error\)/);
  assert.match(databaseSource, /finalizar_cancelamentos_lote"/);
});
