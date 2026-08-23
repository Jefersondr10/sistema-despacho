// Identidade do aparelho, não da conta. Esta chave fica deliberadamente fora
// de ACCOUNT_STORAGE_PREFIX para sobreviver à restauração da sessão e ao
// logout. O banco sempre combina a estação com auth.uid().
const BIPAGEM_STATION_STORAGE_KEY =
  "sistema-despacho-device:bipagem-estacao";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BipagemStationStorage = Pick<Storage, "getItem" | "setItem">;

type GetOrCreateBipagemStationOptions = {
  storage: BipagemStationStorage;
  randomUUID: () => string;
};

export function getBipagemStationStorageKey() {
  return BIPAGEM_STATION_STORAGE_KEY;
}

export function isValidBipagemStationId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function getOrCreateBipagemStationId({
  storage,
  randomUUID,
}: GetOrCreateBipagemStationOptions) {
  const storageKey = getBipagemStationStorageKey();

  try {
    const storedStationId = storage.getItem(storageKey);

    if (isValidBipagemStationId(storedStationId)) {
      return storedStationId.trim().toLowerCase();
    }
  } catch {
    // Navegadores com armazenamento restrito ainda podem usar a estação
    // durante a aba atual; apenas a restauração após fechar ficará indisponível.
  }

  const stationId = randomUUID().trim().toLowerCase();

  if (!isValidBipagemStationId(stationId)) {
    throw new Error("Não foi possível identificar este aparelho para a bipagem.");
  }

  try {
    storage.setItem(storageKey, stationId);
  } catch {
    // A identificação continua válida em memória mesmo sem persistência local.
  }

  return stationId;
}
