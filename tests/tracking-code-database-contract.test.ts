import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guardMigrationSource = readFileSync(
  new URL(
    "../supabase/migrations/202608230002_tracking_code_guard.sql",
    import.meta.url,
  ),
  "utf8",
);

const relaxedMigrationSource = readFileSync(
  new URL(
    "../supabase/migrations/202608240001_relax_tracking_code_guard.sql",
    import.meta.url,
  ),
  "utf8",
);

const nfeBlockMigrationSource = readFileSync(
  new URL(
    "../supabase/migrations/202608290002_block_valid_nfe_access_keys.sql",
    import.meta.url,
  ),
  "utf8",
);

const latestBipagemRpcSource = readFileSync(
  new URL(
    "../supabase/migrations/202608230001_independent_bipagem_sessions.sql",
    import.meta.url,
  ),
  "utf8",
);

test("migration historica registra o bloqueio de formatos de rastreio", () => {
  assert.match(
    guardMigrationSource,
    /create or replace function public\.validar_codigo_rastreio_item_bipagem\(\)/,
  );
  assert.match(
    guardMigrationSource,
    /coalesce\(char_length\(v_codigo_normalizado\), 0\) not between 6 and 60/,
  );
  assert.ok(
    guardMigrationSource.includes("v_codigo_normalizado ~ '^[0-9.-]+$'"),
  );
  assert.match(guardMigrationSource, /char_length\(v_codigo_digitos\) = 8/);
  assert.ok(
    guardMigrationSource.includes("v_codigo_normalizado ~ '^[0-9./-]+$'"),
  );
  assert.match(guardMigrationSource, /char_length\(v_codigo_digitos\) = 44/);
  assert.match(
    guardMigrationSource,
    /v_codigo_original is distinct from v_codigo_normalizado/,
  );
  assert.match(guardMigrationSource, /v_codigo_normalizado ~ '\^000201'/);
  assert.match(guardMigrationSource, /v_codigo_normalizado ~ 'BRGOVBCBPIX'/);
  assert.match(
    guardMigrationSource,
    /before insert or update of codigo, codigo_normalizado/,
  );
  assert.doesNotMatch(guardMigrationSource, /before update\s+on/);
});

test("migration posterior remove o bloqueio de formato e conserva apenas nao vazio", () => {
  assert.match(
    relaxedMigrationSource,
    /drop trigger if exists validar_codigo_rastreio_item_bipagem\s+on public\.itens_sessao_bipagem/,
  );
  assert.match(
    relaxedMigrationSource,
    /drop function if exists public\.validar_codigo_rastreio_item_bipagem\(\)/,
  );
  assert.match(
    relaxedMigrationSource,
    /drop constraint if exists itens_sessao_bipagem_codigo_rastreio_basico_check/,
  );
  assert.match(
    relaxedMigrationSource,
    /add constraint itens_sessao_bipagem_codigo_nao_vazio_check/,
  );
  assert.match(
    relaxedMigrationSource,
    /public\.normalizar_codigo_pacote\(codigo\) <> ''/,
  );
  assert.match(
    relaxedMigrationSource,
    /public\.normalizar_codigo_pacote\(codigo_normalizado\) <> ''/,
  );
  assert.match(relaxedMigrationSource, /\) not valid;/);
  assert.doesNotMatch(relaxedMigrationSource, /char_length|regexp_replace/);
  assert.doesNotMatch(relaxedMigrationSource, /BRGOVBCBPIX|\^000201/);
  assert.doesNotMatch(
    relaxedMigrationSource,
    /create\s+trigger\s+validar_codigo_rastreio_item_bipagem/i,
  );
});

test("RPC de bipagem continua rejeitando codigo vazio apos normalizacao", () => {
  assert.match(
    latestBipagemRpcSource,
    /v_codigo_normalizado := public\.normalizar_codigo_pacote\(p_codigo\)/,
  );
  assert.match(
    latestBipagemRpcSource,
    /if coalesce\(v_codigo_normalizado, ''\) = '' then\s+raise exception 'codigo obrigatorio\.'/,
  );
});

test("migration reconhece chave numerica ou alfanumerica plausivel com DV valido", () => {
  assert.match(
    nfeBlockMigrationSource,
    /create or replace function public\.eh_chave_nfe_valida\(p_codigo text\)/,
  );
  assert.ok(
    nfeBlockMigrationSource.includes(
      "v_codigo !~ '^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$'",
    ),
  );
  assert.match(
    nfeBlockMigrationSource,
    /v_codigo := upper\(\s*regexp_replace\(v_apresentacao, '\[\[:space:\]\.\/-\]', '', 'g'\)\s*\)/,
  );
  assert.match(
    nfeBlockMigrationSource,
    /ascii\(substring\(v_codigo from v_indice for 1\)\) - 48/,
  );
  assert.doesNotMatch(
    nfeBlockMigrationSource,
    /regexp_replace\(v_apresentacao, '\[\^0-9\]'/,
  );
  assert.match(nfeBlockMigrationSource, /for v_indice in reverse 43\.\.1 loop/);
  assert.match(nfeBlockMigrationSource, /v_resto := v_soma % 11/);
  assert.match(nfeBlockMigrationSource, /when v_resto in \(0, 1\) then 0/);
  assert.match(
    nfeBlockMigrationSource,
    /substring\(v_codigo from 1 for 2\) not in \([\s\S]*'11'[\s\S]*'35'[\s\S]*'53'/,
  );
  assert.match(
    nfeBlockMigrationSource,
    /substring\(v_codigo from 5 for 2\)::integer not between 1 and 12/,
  );
  assert.match(
    nfeBlockMigrationSource,
    /substring\(v_codigo from 21 for 2\) not in \('55', '65'\)/,
  );
  assert.match(
    nfeBlockMigrationSource,
    /substring\(v_codigo from 26 for 9\)::bigint = 0/,
  );
  assert.match(
    nfeBlockMigrationSource,
    /substring\(v_codigo from 35 for 1\)::integer not between 1 and 9/,
  );
  assert.match(
    nfeBlockMigrationSource,
    /v_codigo = repeat\(substring\(v_codigo from 1 for 1\), 44\)/,
  );
  assert.doesNotMatch(nfeBlockMigrationSource, /char_length/i);
});

test("guard de NF-e cobre RPC e insert direto sem prender registros legados", () => {
  assert.match(
    nfeBlockMigrationSource,
    /coalesce\(public\.eh_chave_nfe_valida\(new\.codigo\), false\)/,
  );
  assert.match(
    nfeBlockMigrationSource,
    /before insert or update of codigo, codigo_normalizado\s+on public\.itens_sessao_bipagem/,
  );
  assert.match(
    nfeBlockMigrationSource,
    /before insert or update of codigo\s+on public\.pacotes/,
  );
  assert.match(nfeBlockMigrationSource, /errcode = '22023'/);
  assert.match(nfeBlockMigrationSource, /chave de NF-e, nao um rastreio/i);
  assert.match(
    nfeBlockMigrationSource,
    /tg_table_name = 'pacotes'[\s\S]*tg_op = 'INSERT'[\s\S]*from public\.itens_sessao_bipagem as item[\s\S]*join public\.sessoes_bipagem as sessao[\s\S]*item\.sessao_id = \(v_new ->> 'sessao_id'\)::uuid/,
  );
  assert.match(nfeBlockMigrationSource, /item\.status = 'pendente'/);
  assert.match(nfeBlockMigrationSource, /sessao\.status = 'aberta'/);
  assert.match(
    nfeBlockMigrationSource,
    /sessao\.loja_id = \(v_new ->> 'loja_id'\)::uuid/,
  );
  assert.match(
    nfeBlockMigrationSource,
    /sessao\.marketplace_id is not distinct from\s+nullif\(v_new ->> 'marketplace_id', ''\)::uuid/,
  );
  assert.match(
    nfeBlockMigrationSource,
    /sessao\.transportadora_id is not distinct from\s+nullif\(v_new ->> 'transportadora_id', ''\)::uuid/,
  );
  assert.match(
    nfeBlockMigrationSource,
    /sessao\.tipo_operacao::text = \(v_new ->> 'tipo_operacao'\)/,
  );
  assert.match(
    nfeBlockMigrationSource,
    /sessao\.melhor_envio is not distinct from\s+\(v_new ->> 'melhor_envio'\)::boolean/,
  );
  assert.doesNotMatch(nfeBlockMigrationSource, /new\.(?:loja_id|marketplace_id|transportadora_id|tipo_operacao|melhor_envio)/);
  assert.doesNotMatch(nfeBlockMigrationSource, /add constraint|validate constraint/i);
});
