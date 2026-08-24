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
