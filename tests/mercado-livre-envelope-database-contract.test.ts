import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSource = readFileSync(
  new URL(
    "../supabase/migrations/202609210001_extract_mercado_livre_envelope.sql",
    import.meta.url,
  ),
  "utf8",
);

test("migration extrai somente o envelope JSON estrito ID + T=LM", () => {
  assert.match(
    migrationSource,
    /create or replace function public\.extrair_codigo_envelope_mercado_livre\(\s*p_codigo text\s*\)/,
  );
  assert.match(migrationSource, /v_payload json;/);
  assert.doesNotMatch(migrationSource, /v_payload jsonb;/);
  assert.match(
    migrationSource,
    /count\(\*\) filter \(where lower\(btrim\(entry\.key\)\) = 'id'\)/,
  );
  assert.match(
    migrationSource,
    /count\(\*\) filter \(where lower\(btrim\(entry\.key\)\) = 't'\)/,
  );
  assert.match(migrationSource, /v_id_count <> 1/);
  assert.match(migrationSource, /v_type_count <> 1/);
  assert.match(migrationSource, /upper\(btrim\(v_type\)\) <> 'LM'/);
  assert.match(migrationSource, /v_id_type not in \('string', 'number'\)/);
  assert.match(migrationSource, /v_id::numeric > 9007199254740991/);
  assert.match(migrationSource, /return p_codigo;/);
});

test("RPC canoniza antes da trava e preserva regras de conta e operador", () => {
  const canonicalAssignment = migrationSource.indexOf(
    "public.extrair_codigo_envelope_mercado_livre(p_codigo)",
    migrationSource.indexOf(
      "create or replace function public.adicionar_item_sessao_bipagem_v3",
    ),
  );
  const advisoryLock = migrationSource.indexOf(
    "perform pg_advisory_xact_lock",
    migrationSource.indexOf(
      "create or replace function public.adicionar_item_sessao_bipagem_v3",
    ),
  );

  assert.ok(canonicalAssignment > 0);
  assert.ok(advisoryLock > canonicalAssignment);
  assert.match(
    migrationSource,
    /v_account_id uuid := public\.exigir_usuario_autenticado\(\)/,
  );
  assert.match(migrationSource, /public\.current_account_can_write\(\)/);
  assert.match(migrationSource, /sessao\.iniciada_por = v_actor_id/);
  assert.match(migrationSource, /bipado_por[\s\S]*v_actor_id/);
});

test("guards existentes comparam e persistem o codigo canonico", () => {
  assert.match(
    migrationSource,
    /create or replace function public\.validar_unicidade_rastreio_item_pendente\(\)[\s\S]*new\.codigo := v_codigo_normalizado;[\s\S]*new\.codigo_normalizado := v_codigo_normalizado;/,
  );
  assert.match(
    migrationSource,
    /create or replace function public\.validar_unicidade_rastreio_pacote_ativo\(\)[\s\S]*new\.codigo := v_codigo_normalizado;/,
  );
  assert.match(
    migrationSource,
    /create or replace function public\.rejeitar_chave_nfe_como_rastreio\(\)[\s\S]*eh_chave_nfe_valida\(v_codigo\)/,
  );
  assert.match(
    migrationSource,
    /v_codigo text := public\.extrair_codigo_envelope_mercado_livre\(new\.codigo\)/,
  );
  assert.match(
    migrationSource,
    /v_codigo_normalizado := public\.normalizar_codigo_pacote\(\s*public\.extrair_codigo_envelope_mercado_livre\(new\.codigo\)\s*\)/,
  );
});

test("consultas frequentes preservam as expressoes cobertas pelos indices", () => {
  const itemGuard = migrationSource.match(
    /create or replace function public\.validar_unicidade_rastreio_item_pendente\(\)[\s\S]*?(?=create or replace function public\.validar_unicidade_rastreio_pacote_ativo)/,
  )?.[0];
  const packageGuard = migrationSource.match(
    /create or replace function public\.validar_unicidade_rastreio_pacote_ativo\(\)[\s\S]*?(?=-- Esta e a definicao mais recente)/,
  )?.[0];
  const rpc = migrationSource.match(
    /create or replace function public\.adicionar_item_sessao_bipagem_v3\([\s\S]*?(?=notify pgrst)/,
  )?.[0];

  assert.ok(itemGuard);
  assert.ok(packageGuard);
  assert.ok(rpc);
  for (const source of [itemGuard, packageGuard, rpc]) {
    assert.match(
      source,
      /public\.normalizar_codigo_pacote\(pacote\.codigo\) = v_codigo_normalizado/,
    );
    assert.doesNotMatch(
      source,
      /extrair_codigo_envelope_mercado_livre\(pacote\.codigo\)/,
    );
  }
  assert.match(itemGuard, /outro\.codigo_normalizado = v_codigo_normalizado/);
  assert.match(packageGuard, /item\.codigo_normalizado = v_codigo_normalizado/);
  assert.match(rpc, /item\.codigo_normalizado = v_codigo_normalizado/);
});

test("migration nao reescreve registros antigos nem altera o normalizador indexado", () => {
  assert.doesNotMatch(
    migrationSource,
    /create or replace function public\.normalizar_codigo_pacote/i,
  );
  assert.doesNotMatch(migrationSource, /create\s+(?:unique\s+)?index/i);
  assert.doesNotMatch(
    migrationSource,
    /update public\.itens_sessao_bipagem\s+set\s+(?:codigo|codigo_normalizado)/i,
  );
  assert.doesNotMatch(
    migrationSource,
    /update public\.pacotes\s+set\s+codigo/i,
  );
});

test("helper nao fica exposto anonimamente e recarrega o schema da API", () => {
  assert.match(
    migrationSource,
    /revoke execute on function public\.extrair_codigo_envelope_mercado_livre\(text\)\s+from public, anon;/,
  );
  assert.match(
    migrationSource,
    /grant execute on function public\.extrair_codigo_envelope_mercado_livre\(text\)\s+to authenticated, service_role;/,
  );
  assert.match(migrationSource, /notify pgrst, 'reload schema';/);
});
