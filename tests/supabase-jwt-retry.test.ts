import assert from "node:assert/strict";
import test from "node:test";

import {
  isJwtIssuedAtFutureError,
  retrySupabaseReadForJwtClockSkew,
} from "../lib/supabase-jwt-retry.ts";

test("reconhece somente o erro de JWT emitido no futuro", () => {
  assert.equal(
    isJwtIssuedAtFutureError(new Error("JWT issued at future")),
    true,
  );
  assert.equal(
    isJwtIssuedAtFutureError({
      code: "PGRST303",
      message: "JWT issued at future",
    }),
    true,
  );
  assert.equal(isJwtIssuedAtFutureError(new Error("JWT expired")), false);
  assert.equal(
    isJwtIssuedAtFutureError({ code: "PGRST303", message: "Invalid JWT" }),
    false,
  );
  assert.equal(
    isJwtIssuedAtFutureError({
      code: "OTHER_ERROR",
      message: "JWT issued at future",
    }),
    false,
  );
  assert.equal(
    isJwtIssuedAtFutureError(new Error("JWT issued at future while loading")),
    false,
  );
});

test("repete leitura idempotente com atrasos limitados ate funcionar", async () => {
  let calls = 0;
  const waits: number[] = [];

  const result = await retrySupabaseReadForJwtClockSkew(
    async () => {
      calls += 1;
      if (calls < 3) {
        throw { code: "PGRST303", message: "JWT issued at future" };
      }
      return "ok";
    },
    {
      delaysMs: [10, 20, 30],
      sleep: async (delayMs) => {
        waits.push(delayMs);
      },
    },
  );

  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [10, 20]);
});

test("nao repete outros erros do Supabase", async () => {
  let calls = 0;

  await assert.rejects(
    retrySupabaseReadForJwtClockSkew(
      async () => {
        calls += 1;
        throw new Error("permission denied");
      },
      { delaysMs: [1], sleep: async () => undefined },
    ),
    /permission denied/,
  );

  assert.equal(calls, 1);
});

test("encerra depois do numero configurado de novas tentativas", async () => {
  let calls = 0;

  await assert.rejects(
    retrySupabaseReadForJwtClockSkew(
      async () => {
        calls += 1;
        throw new Error("JWT issued at future");
      },
      { delaysMs: [1, 2], sleep: async () => undefined },
    ),
    /JWT issued at future/,
  );

  assert.equal(calls, 3);
});

test("nao reinicia a leitura quando a tela deixou de ser atual", async () => {
  let calls = 0;
  let current = true;

  await assert.rejects(
    retrySupabaseReadForJwtClockSkew(
      async () => {
        calls += 1;
        throw new Error("JWT issued at future");
      },
      {
        delaysMs: [1],
        shouldContinue: () => current,
        sleep: async () => {
          current = false;
        },
      },
    ),
    /JWT issued at future/,
  );

  assert.equal(calls, 1);
});
