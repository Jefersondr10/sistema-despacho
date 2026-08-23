import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getBipagemStationStorageKey,
  getOrCreateBipagemStationId,
  isValidBipagemStationId,
} from "../app/bipagem/bipagem-station.ts";

const migrationSource = readFileSync(
  new URL(
    "../supabase/migrations/202608230001_independent_bipagem_sessions.sql",
    import.meta.url,
  ),
  "utf8",
);
const databaseSource = readFileSync(
  new URL("../lib/database.ts", import.meta.url),
  "utf8",
);
const bipagemSource = readFileSync(
  new URL("../app/bipagem/bipagem-form.tsx", import.meta.url),
  "utf8",
);

const STATION_A = "11111111-1111-4111-8111-111111111111";
const STATION_B = "22222222-2222-4222-8222-222222222222";

function memoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test("cada aparelho mantém uma identificação estável entre acessos", () => {
  const storage = memoryStorage();
  let generated = 0;
  const randomUUID = () => {
    generated += 1;
    return generated === 1 ? STATION_A : STATION_B;
  };

  assert.equal(
    getOrCreateBipagemStationId({ storage, randomUUID }),
    STATION_A,
  );
  assert.equal(
    getOrCreateBipagemStationId({ storage, randomUUID }),
    STATION_A,
  );
  assert.equal(generated, 1);
  assert.equal(
    getBipagemStationStorageKey(),
    "sistema-despacho-device:bipagem-estacao",
  );
});

test("identificações inválidas nunca entram no banco", () => {
  assert.equal(isValidBipagemStationId("01001010"), false);
  assert.equal(isValidBipagemStationId(STATION_A), true);

  assert.throws(
    () =>
      getOrCreateBipagemStationId({
        storage: memoryStorage(),
        randomUUID: () => "inválido",
      }),
    /identificar este aparelho/i,
  );
});

test("sessões abertas ficam isoladas por estação mesmo com a mesma configuração", () => {
  assert.match(
    migrationSource,
    /add column if not exists estacao_id uuid/i,
  );
  assert.match(
    migrationSource,
    /unique index[\s\S]*\(user_id, estacao_id\)[\s\S]*status = 'aberta'/i,
  );
  assert.match(
    migrationSource,
    /obter_sessao_bipagem_aberta[\s\S]*p_estacao_id uuid/i,
  );
  assert.match(
    migrationSource,
    /iniciar_sessao_bipagem_independente[\s\S]*p_estacao_id uuid/i,
  );
  assert.match(
    databaseSource,
    /\.eq\("estacao_id", normalizedStationId\)/,
  );
  assert.match(bipagemSource, /getOrCreateBipagemStationId/);
  assert.match(bipagemSource, /estacao_id: stationId/);
});

test("a inclusão serializa o código e rejeita duplicado em outro lote aberto", () => {
  assert.match(
    migrationSource,
    /adicionar_item_sessao_bipagem_v3[\s\S]*pg_advisory_xact_lock[\s\S]*outro lote aberto/i,
  );
  assert.match(
    migrationSource,
    /idx_itens_sessao_bipagem_user_codigo_pendentes/i,
  );
  assert.match(
    migrationSource,
    /select\s+exists[\s\S]*exists[\s\S]*into v_pacote_finalizado, v_outro_lote_aberto/i,
  );
  assert.match(
    databaseSource,
    /rpc\("adicionar_item_sessao_bipagem_v3", args\)[\s\S]*adicionar_item_sessao_bipagem_v2/,
  );
});

test("pacotes de um lote preservam a mesma loja e o mesmo marketplace", () => {
  assert.match(
    migrationSource,
    /validar_identidade_pacote[\s\S]*sessao\.loja_id = new\.loja_id[\s\S]*sessao\.marketplace_id is not distinct from new\.marketplace_id/i,
  );
  assert.match(
    migrationSource,
    /before insert or update of user_id, loja_id, marketplace_id, sessao_id/i,
  );
});
