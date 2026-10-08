import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("consulta de clientes antigos usa indice e continua isolada por conta", () => {
  const sql = read("supabase/migrations/202610080001_scan_lookup_index.sql");
  assert.match(sql, /pacote\.codigo_normalizado = public\.normalizar_codigo_pacote\(p_codigo\)/);
  assert.match(sql, /pacote\.user_id = \(select public\.current_account_id\(\)\)/);
  assert.match(sql, /pacote\.status <> 'cancelado'/);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /limit 1/);
  assert.doesNotMatch(sql, /normalizar_codigo_pacote\(pacote\.codigo\)|security definer|grant|alter role/i);
});

test("sem consulta previa a RPC continua protegendo duplicados de toda a conta", () => {
  const sql = read("supabase/migrations/202610070001_finalize_batch_indexed_lookup.sql");
  const rpc = sql.match(/function public\.adicionar_item_sessao_bipagem_v3[\s\S]*?\$function\$\s*;/i)?.[0];
  assert.ok(rpc);
  assert.match(rpc, /pg_advisory_xact_lock/);
  assert.match(rpc, /pacote\.user_id = v_account_id/);
  assert.match(rpc, /pacote\.codigo_normalizado = v_codigo_normalizado/);
  assert.match(rpc, /pacote\.status <> 'cancelado'/);
  assert.match(rpc, /outra_sessao\.status = 'aberta'/);
  assert.match(rpc, /sessao\.iniciada_por = v_actor_id/);
  assert.match(rpc, /if v_pacote_finalizado then[\s\S]*raise exception/);
  assert.match(rpc, /if v_outro_lote_aberto then[\s\S]*raise exception/);
});

test("camera reduz intervalo sem aceitar outro pacote enquanto salva", () => {
  const camera = read("app/bipagem/mobile-camera-scanner.tsx");
  assert.match(camera, /delayBetweenScanSuccess: 180/);
  assert.match(camera, /if \(processingRef\.current \|\| busyRef\.current\)\s*\{\s*return;/);
  assert.match(camera, /registerCameraDetection\(/);
  assert.match(camera, /\.then\(\(outcome\) =>[\s\S]*audioFeedback\.play\(outcome\.tone\)/);
});
