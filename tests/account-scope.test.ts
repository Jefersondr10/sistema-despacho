import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNT_STORAGE_PREFIX,
  canDisplayAccountData,
  getAccountStorageKeys,
} from "../app/_lib/account-scope.ts";

test("dados de uma conta nunca ficam visiveis para outra conta", () => {
  assert.equal(canDisplayAccountData("usuario-a", "usuario-a"), true);
  assert.equal(canDisplayAccountData("usuario-a", "usuario-b"), false);
  assert.equal(canDisplayAccountData("usuario-a", null), false);
  assert.equal(canDisplayAccountData(null, "usuario-b"), false);
});

test("somente chaves da aplicacao sao selecionadas para limpeza", () => {
  const keys = [
    `${ACCOUNT_STORAGE_PREFIX}usuario-a:filtros`,
    "sb-projeto-auth-token",
    `${ACCOUNT_STORAGE_PREFIX}usuario-a:sessao-bipagem`,
  ];
  const storage = {
    length: keys.length,
    key(index: number) {
      return keys[index] ?? null;
    },
    removeItem() {},
  };

  assert.deepEqual(getAccountStorageKeys(storage), [keys[0], keys[2]]);
});
