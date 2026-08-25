import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSource = readFileSync(
  new URL(
    "../supabase/migrations/202608250001_global_tracking_uniqueness.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionDefinition(name: string) {
  const match = migrationSource.match(
    new RegExp(
      `create or replace function public\\.${name}\\s*\\([\\s\\S]*?\\n\\$\\$;`,
      "i",
    ),
  );

  assert.ok(match, `funcao ${name} nao encontrada`);
  return match[0];
}

function packageTriggerFunctionDefinitions() {
  const names = Array.from(
    migrationSource.matchAll(
      /create\s+(?:constraint\s+)?trigger\s+\w+([\s\S]*?)on\s+public\.pacotes\s+for\s+each\s+row\s+execute\s+function\s+public\.(\w+)\s*\(\s*\)/gi,
    ),
    (match) => ({ clause: match[1], name: match[2] }),
  );

  assert.ok(names.length, "trigger de unicidade em pacotes nao encontrado");
  return names.map(({ clause, name }) => ({
    clause,
    name,
    definition: functionDefinition(name),
  }));
}

test("busca de rastreio ativo e global na conta, sem loja ou marketplace", () => {
  const definition = functionDefinition(
    "buscar_pacote_ativo_global_normalizado",
  );
  const compatibilityDefinition = functionDefinition(
    "buscar_pacote_ativo_normalizado",
  );

  assert.match(definition, /pacote\.user_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(
    definition,
    /normalizar_codigo_pacote\(pacote\.codigo\)[\s\S]*normalizar_codigo_pacote\(p_codigo\)/i,
  );
  assert.match(definition, /pacote\.status\s*<>\s*'cancelado'/i);
  assert.doesNotMatch(definition, /pacote\.loja_id\s*=/i);
  assert.doesNotMatch(definition, /pacote\.marketplace_id\s*=/i);
  assert.match(
    compatibilityDefinition,
    /from\s+public\.pacotes\s+as\s+pacote/i,
  );
  assert.match(
    compatibilityDefinition,
    /pacote\.user_id\s*=\s*\(select auth\.uid\(\)\)/i,
  );
  assert.match(
    compatibilityDefinition,
    /pacote\.status\s*<>\s*'cancelado'/i,
  );
  assert.doesNotMatch(
    compatibilityDefinition,
    /\band\s+pacote\.loja_id\s*=\s*p_loja_id/i,
  );
  assert.match(
    compatibilityDefinition,
    /order\s+by\s+\(pacote\.loja_id\s*=\s*p_loja_id\)\s+desc\s+nulls\s+last/i,
  );
});

test("RPC v3 serializa o codigo por conta e consulta pacotes e lotes globalmente", () => {
  const definition = functionDefinition("adicionar_item_sessao_bipagem_v3");

  assert.match(definition, /v_user_id\s+uuid\s*:=\s*public\.exigir_usuario_autenticado\(\)/i);
  assert.match(definition, /pg_advisory_xact_lock/i);
  assert.match(
    definition,
    /bipagem-codigo:[\s\S]{0,300}v_user_id::text[\s\S]{0,300}v_codigo_normalizado/i,
  );
  assert.doesNotMatch(
    definition,
    /bipagem-codigo:[\s\S]{0,400}(?:v_loja_id|loja_id|marketplace_id)/i,
  );

  assert.match(definition, /from\s+public\.pacotes\s+as\s+pacote/i);
  assert.match(definition, /pacote\.user_id\s*=\s*v_user_id/i);
  assert.match(definition, /pacote\.status\s*<>\s*'cancelado'/i);
  assert.doesNotMatch(definition, /pacote\.loja_id\s*=/i);
  assert.doesNotMatch(definition, /pacote\.marketplace_id\s*=/i);

  assert.match(definition, /from\s+public\.itens_sessao_bipagem\s+as\s+item/i);
  assert.match(definition, /item\.user_id\s*=\s*v_user_id/i);
  assert.match(definition, /item\.codigo_normalizado\s*=\s*v_codigo_normalizado/i);
  assert.match(definition, /item\.status\s*=\s*'pendente'/i);
  assert.match(definition, /outra_sessao\.status\s*=\s*'aberta'/i);
  assert.match(definition, /outra_sessao\.id\s*<>\s*p_sessao_id/i);
  assert.doesNotMatch(definition, /outra_sessao\.loja_id\s*=/i);
  assert.doesNotMatch(definition, /outra_sessao\.marketplace_id\s*=/i);
});

test("RPC v2 delega para a v3 sem reintroduzir escopo operacional", () => {
  const definition = functionDefinition("adicionar_item_sessao_bipagem_v2");

  assert.match(
    definition,
    /from\s+public\.adicionar_item_sessao_bipagem_v3\s*\(\s*p_codigo\s*,\s*p_sessao_id\s*\)/i,
  );
  assert.doesNotMatch(definition, /\b(?:loja|marketplace)_id\b/i);
});

test("finalizacao trava codigos em ordem e rejeita historico ativo de toda a conta", () => {
  const definition = functionDefinition("finalizar_sessao_bipagem");
  const lockPosition = definition.search(/pg_advisory_xact_lock/i);
  const orderPosition = definition.search(/order\s+by\s+(?:item\.)?codigo_normalizado/i);
  const duplicateLookup = definition.match(
    /select\s+item\.codigo_normalizado\s+into\s+v_codigo_existente[\s\S]*?(?=if\s+v_codigo_existente)/i,
  )?.[0];

  assert.ok(lockPosition >= 0, "finalizador nao trava os codigos");
  assert.ok(
    orderPosition >= 0 && orderPosition < lockPosition,
    "locks nao possuem ordem deterministica",
  );
  assert.match(
    definition,
    /pg_advisory_xact_lock[\s\S]{0,500}v_user_id::text[\s\S]{0,500}(?:v_codigo_lock|\w+\.codigo_normalizado)/i,
  );
  assert.doesNotMatch(
    definition,
    /pg_advisory_xact_lock[\s\S]{0,500}(?:loja_id|marketplace_id)/i,
  );
  assert.ok(duplicateLookup, "consulta global de duplicidade nao encontrada");
  assert.match(duplicateLookup, /pacote\.user_id\s*=\s*v_user_id/i);
  assert.match(duplicateLookup, /pacote\.status\s*<>\s*'cancelado'/i);
  assert.doesNotMatch(duplicateLookup, /pacote\.loja_id\s*=/i);
  assert.doesNotMatch(duplicateLookup, /pacote\.marketplace_id\s*=/i);
});

test("triggers protegem itens pendentes e pacotes contra bypass concorrente", () => {
  const triggers = packageTriggerFunctionDefinitions();
  const uniquenessTrigger = triggers.find(({ clause, definition }) =>
    /before[\s\S]*insert[\s\S]*update/i.test(clause) &&
    /pg_advisory_xact_lock/i.test(definition) &&
    /normalizar_codigo_pacote/i.test(definition),
  );

  assert.ok(uniquenessTrigger, "trigger concorrente para insert/update nao encontrado");
  const definition = uniquenessTrigger.definition;

  assert.match(definition, /new\.user_id/i);
  assert.match(definition, /pg_advisory_xact_lock/i);
  assert.match(definition, /normalizar_codigo_pacote\(new\.codigo\)/i);
  assert.match(definition, /pacote\.user_id\s*=\s*new\.user_id/i);
  assert.match(definition, /pacote\.status\s*<>\s*'cancelado'/i);
  assert.match(
    definition,
    /pacote\.id\s*(?:<>|is\s+distinct\s+from)\s*new\.id/i,
  );
  assert.match(definition, /from\s+public\.itens_sessao_bipagem\s+as\s+item/i);
  assert.match(definition, /item\.user_id\s*=\s*new\.user_id/i);
  assert.match(definition, /item\.status\s*=\s*'pendente'/i);
  assert.match(definition, /sessao\.status\s*=\s*'aberta'/i);
  assert.match(
    definition,
    /sessao\.id\s+is\s+distinct\s+from\s+new\.sessao_id/i,
  );
  assert.doesNotMatch(definition, /pacote\.loja_id\s*=/i);
  assert.doesNotMatch(definition, /pacote\.marketplace_id\s*=/i);

  const pendingTrigger = functionDefinition(
    "validar_unicidade_rastreio_item_pendente",
  );
  assert.match(
    migrationSource,
    /create\s+trigger\s+validar_unicidade_rastreio_item_pendente[\s\S]*before\s+insert\s+or\s+update[\s\S]*on\s+public\.itens_sessao_bipagem/i,
  );
  assert.match(pendingTrigger, /new\.user_id/i);
  assert.match(pendingTrigger, /pg_advisory_xact_lock/i);
  assert.match(pendingTrigger, /from\s+public\.pacotes\s+as\s+pacote/i);
  assert.match(pendingTrigger, /pacote\.user_id\s*=\s*new\.user_id/i);
  assert.match(
    pendingTrigger,
    /normalizar_codigo_pacote\(pacote\.codigo\)\s*=\s*v_codigo_normalizado/i,
  );
  assert.match(pendingTrigger, /pacote\.status\s*<>\s*'cancelado'/i);
  assert.match(pendingTrigger, /outro\.user_id\s*=\s*new\.user_id/i);
  assert.match(pendingTrigger, /outra_sessao\.status\s*=\s*'aberta'/i);
  assert.doesNotMatch(pendingTrigger, /pacote\.loja_id\s*=/i);
  assert.doesNotMatch(pendingTrigger, /pacote\.marketplace_id\s*=/i);
  assert.doesNotMatch(pendingTrigger, /outra_sessao\.loja_id\s*=/i);
  assert.doesNotMatch(pendingTrigger, /outra_sessao\.marketplace_id\s*=/i);
});

test("cancelados ficam fora da reserva e legado nao e alterado destrutivamente", () => {
  const triggerDefinitions = packageTriggerFunctionDefinitions()
    .map(({ definition }) => definition)
    .join("\n");

  assert.match(
    migrationSource,
    /(?:where|and)\s+(?:pacote\.)?status\s*<>\s*'cancelado'/i,
  );
  assert.match(
    triggerDefinitions,
    /(?:new\.status\s*=\s*'cancelado'|pacote\.status\s*<>\s*'cancelado')/i,
  );
  assert.doesNotMatch(
    migrationSource,
    /update\s+public\.pacotes\s+set[\s\S]{0,300}(?:status\s*=\s*'cancelado'|loja_id\s*=|marketplace_id\s*=)/i,
  );
  assert.doesNotMatch(migrationSource, /delete\s+from\s+public\.pacotes\b/i);

  const hasGlobalUniquenessTrigger = /create\s+(?:constraint\s+)?trigger[\s\S]*on\s+public\.pacotes/i.test(
    migrationSource,
  );
  const hasGuardedUniqueIndex =
    /if\s+not\s+exists[\s\S]*having\s+count\(\*\)\s*>\s*1[\s\S]*create\s+unique\s+index/i.test(
      migrationSource,
    );
  assert.ok(
    hasGlobalUniquenessTrigger || hasGuardedUniqueIndex,
    "legado precisa ser preservado por trigger ou indice criado somente sem conflitos",
  );
});

test("a identidade da conta permanece em todas as chaves de unicidade", () => {
  const v3 = functionDefinition("adicionar_item_sessao_bipagem_v3");
  const finalizer = functionDefinition("finalizar_sessao_bipagem");
  const triggers = packageTriggerFunctionDefinitions()
    .map(({ definition }) => definition)
    .join("\n");

  assert.match(v3, /v_user_id::text/i);
  assert.match(finalizer, /v_user_id::text/i);
  assert.match(triggers, /new\.user_id/i);
  assert.doesNotMatch(
    migrationSource,
    /create\s+unique\s+index[\s\S]{0,200}on\s+public\.pacotes\s*\(\s*public\.normalizar_codigo_pacote\(codigo\)/i,
  );
});
