export const ACCOUNT_STORAGE_PREFIX = "sistema-despacho:";

type StorageLike = Pick<Storage, "key" | "length" | "removeItem">;

export function getAccountStorageKeys(storage: StorageLike) {
  const keys: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);

    if (key?.startsWith(ACCOUNT_STORAGE_PREFIX)) {
      keys.push(key);
    }
  }

  return keys;
}

export function clearAccountScopedBrowserState() {
  if (typeof window === "undefined") {
    return;
  }

  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[storageName];
      for (const key of getAccountStorageKeys(storage)) {
        storage.removeItem(key);
      }
    } catch {
      // Navegadores podem bloquear Storage; isso não deve bloquear o logout.
    }
  }
}

export function canDisplayAccountData(
  stateOwnerUserId: string | null,
  currentUserId: string | null,
) {
  return Boolean(currentUserId && stateOwnerUserId === currentUserId);
}
