import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSource = readFileSync(
  new URL(
    "../supabase/migrations/202608230002_tracking_code_guard.sql",
    import.meta.url,
  ),
  "utf8",
);

test("Supabase bloqueia novas gravacoes de CEP, PIX e payload composto", () => {
  assert.match(
    migrationSource,
    /create or replace function public\.validar_codigo_rastreio_item_bipagem\(\)/,
  );
  assert.match(
    migrationSource,
    /coalesce\(char_length\(v_codigo_normalizado\), 0\) not between 6 and 60/,
  );
  assert.ok(
    migrationSource.includes("v_codigo_normalizado ~ '^[0-9]{8}$'"),
  );
  assert.match(migrationSource, /v_codigo_normalizado ~ '\^000201'/);
  assert.match(migrationSource, /v_codigo_normalizado ~ 'BRGOVBCBPIX'/);
  assert.match(
    migrationSource,
    /before insert or update of codigo, codigo_normalizado/,
  );
  assert.doesNotMatch(migrationSource, /before update\s+on/);
});
