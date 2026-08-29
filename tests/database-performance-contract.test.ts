import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const databaseSource = read("lib/database.ts");
const storeSource = read("app/_lib/supabase-dispatch-store.ts");
const bipagemSource = read("app/bipagem/bipagem-form.tsx");
const packagesSource = read("app/pacotes/pacotes-view.tsx");
const cancellationsSource = read(
  "app/pacotes-cancelados/pacotes-cancelados-view.tsx",
);
const emailRouteSource = read("app/api/relatorios/enviar-email/route.ts");
const healthRouteSource = read("app/api/supabase-health/route.ts");

test("contexto autenticado reutiliza userId sem validar a sessao por helper", () => {
  assert.match(databaseSource, /export type DatabaseContext = \{[\s\S]*userId\?: string;/);
  assert.match(
    databaseSource,
    /if \(resolvedUserId\) \{\s*return \{ supabase, userId: resolvedUserId \};\s*\}[\s\S]*auth\.getUser/,
  );

  assert.match(storeSource, /const databaseContext: DatabaseContext = \{ userId: requestedUserId \}/);
  assert.match(emailRouteSource, /userId: userData\.user\.id/);
  assert.match(healthRouteSource, /userId: data\.user\.id/);
});

test("busca normalizada nao recarrega o historico completo de pacotes", () => {
  const scopedLookupSource = databaseSource.match(
    /export async function getPacoteAtivoPorCodigo[\s\S]*?(?=export async function getPacoteAtivoGlobalPorCodigo)/,
  )?.[0];
  const globalLookupSource = databaseSource.match(
    /export async function getPacoteAtivoGlobalPorCodigo[\s\S]*?(?=export async function getPacotesFinalizadosPorCodigo)/,
  )?.[0];

  assert.ok(scopedLookupSource, "busca por loja nao encontrada");
  assert.ok(globalLookupSource, "busca global da conta nao encontrada");
  assert.match(
    scopedLookupSource,
    /\.rpc\(\s*"buscar_pacote_ativo_normalizado"/,
  );
  assert.match(scopedLookupSource, /\.eq\("loja_id", lojaId\)/);
  assert.match(
    globalLookupSource,
    /\.rpc\(\s*"buscar_pacote_ativo_global_normalizado"/,
  );
  assert.match(globalLookupSource, /\.eq\("user_id", userId\)/);
  assert.doesNotMatch(globalLookupSource, /p_loja_id|\.eq\("loja_id"/);
  assert.doesNotMatch(globalLookupSource, /getPacotesComRelacionamentos|\.find\(/);
});

test("bipagem verifica a conta inteira sem alterar a busca do cancelamento", () => {
  const scanSource = bipagemSource.match(
    /async function processTrackingCode[\s\S]*?(?=async function finishSession)/,
  )?.[0];
  const cancellationSource = bipagemSource.match(
    /async function confirmSessionPackageCancellation[\s\S]*?(?=\n  const sessionHeader)/,
  )?.[0];

  assert.ok(scanSource, "fluxo de bipagem nao encontrado");
  assert.ok(cancellationSource, "fluxo de cancelamento nao encontrado");
  assert.match(scanSource, /getPacoteAtivoGlobalPorCodigo\(/);
  assert.doesNotMatch(scanSource, /getPacoteAtivoPorCodigo\(/);
  assert.match(
    scanSource,
    /já foi bipado nesta conta, mesmo em outra loja ou marketplace/,
  );
  assert.match(cancellationSource, /getPacoteAtivoPorCodigo\(/);
  assert.match(cancellationSource, /\{ loja_id: targetPackage\.loja_id \}/);
  assert.doesNotMatch(cancellationSource, /getPacoteAtivoGlobalPorCodigo\(/);
});

test("frontend usa RPCs v2 com fallback seguro durante o rollout", () => {
  assert.match(databaseSource, /\.rpc\("adicionar_item_sessao_bipagem_v2"/);
  assert.match(databaseSource, /\.rpc\("remover_item_sessao_bipagem_v2"/);
  assert.match(databaseSource, /isMissingRpcFunctionError/);
});

test("store separa pacotes ativos do historico e calcula totais em passagem unica", () => {
  assert.equal(
    storeSource.match(/getPacotesComRelacionamentos\s*\(/g)?.length,
    2,
  );
  assert.match(storeSource, /incluirTotais:\s*false/);
  assert.match(storeSource, /packageTotalsBySession = new Map<string, number>\(\)/);
  assert.doesNotMatch(
    storeSource,
    /mapSessaoRowToDispatchBatch\(row,\s*allPackages\)/,
  );
});

test("cada tela solicita somente o perfil de dados que utiliza", () => {
  assert.match(bipagemSource, /useSupabaseDispatchData\("bipagem"\)/);
  assert.match(packagesSource, /useSupabaseDispatchData\("pacotes"\)/);
  assert.match(cancellationsSource, /useSupabaseDispatchData\("cancelados"\)/);
  assert.match(storeSource, /const loadMovements = profile === "full"/);
  assert.match(storeSource, /loadCancellations[\s\S]*"cancelados"/);
});
