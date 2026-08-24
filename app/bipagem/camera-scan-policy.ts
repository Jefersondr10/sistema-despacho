export const CAMERA_REARM_DELAY_MS = 900;

// Formatos de etiquetas logísticas. EAN/UPC ficam de fora para reduzir leituras
// acidentais de códigos de produto enquanto o operador procura o rastreio.
export const CAMERA_LOGISTICS_BARCODE_FORMAT_NAMES = [
  "CODE_128",
  "CODE_39",
  "CODE_93",
  "ITF",
  "CODABAR",
  "QR_CODE",
  "DATA_MATRIX",
  "PDF_417",
  "AZTEC",
] as const;

const RECOVERABLE_CAMERA_READER_ERROR_KINDS = new Set([
  "NotFoundException",
  "ChecksumException",
  "FormatException",
]);

export type CameraScanGate = {
  latchedCode: string;
  absentSince: number | null;
};

export function createCameraScanGate(): CameraScanGate {
  return {
    latchedCode: "",
    absentSince: null,
  };
}

export function normalizeCameraCode(code: string) {
  return code.replace(/\s+/g, "").toUpperCase();
}

export function registerCameraDetection(
  gate: CameraScanGate,
  rawCode: string,
): { gate: CameraScanGate; acceptedCode: string | null } {
  const decodedValue = rawCode.trim();
  const code = normalizeCameraCode(decodedValue);

  if (!code) {
    return { gate, acceptedCode: null };
  }

  if (gate.latchedCode === code) {
    return {
      gate: { ...gate, absentSince: null },
      acceptedCode: null,
    };
  }

  return {
    gate: { latchedCode: code, absentSince: null },
    // Preserva a estrutura do QR/Data Matrix para que a camada seguinte possa
    // extrair o rastreio e apenas avisar quando a leitura parecer um CEP.
    // A versão compacta fica só no gate.
    acceptedCode: decodedValue,
  };
}

export function registerCameraMiss(
  gate: CameraScanGate,
  now: number,
  rearmDelayMs = CAMERA_REARM_DELAY_MS,
): CameraScanGate {
  if (!gate.latchedCode) {
    return gate;
  }

  if (gate.absentSince === null) {
    return { ...gate, absentSince: now };
  }

  if (now - gate.absentSince < rearmDelayMs) {
    return gate;
  }

  return createCameraScanGate();
}

export function isRecoverableCameraReaderError(error: unknown) {
  if ((typeof error !== "object" || error === null) && typeof error !== "function") {
    return false;
  }

  const errorLike = error as {
    name?: unknown;
    getKind?: unknown;
    constructor?: { kind?: unknown; name?: unknown };
  };
  const candidates: unknown[] = [];

  try {
    candidates.push(errorLike.name);
  } catch {
    // Alguns erros DOM expõem propriedades por getters que podem falhar.
  }

  try {
    if (typeof errorLike.getKind === "function") {
      candidates.push(errorLike.getKind.call(error));
    }
  } catch {
    // Um erro externo não deve derrubar o ciclo da câmera ao ser classificado.
  }

  try {
    candidates.push(errorLike.constructor?.kind);
    candidates.push(errorLike.constructor?.name);
  } catch {
    // Mantém a classificação segura inclusive entre realms diferentes.
  }

  return candidates.some(
    (candidate) =>
      typeof candidate === "string" &&
      RECOVERABLE_CAMERA_READER_ERROR_KINDS.has(candidate),
  );
}

export function getCameraErrorMessage(error: unknown) {
  const name =
    typeof error === "object" && error && "name" in error
      ? String(error.name)
      : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Permissão da câmera negada. Libere o acesso no navegador ou digite o código.";
  }

  if (name === "NotFoundError") {
    return "Nenhuma câmera foi encontrada neste aparelho.";
  }

  if (name === "NotReadableError") {
    return "A câmera está em uso por outro aplicativo. Feche-o e tente novamente.";
  }

  if (name === "OverconstrainedError") {
    return "A câmera deste aparelho não atende aos ajustes de leitura.";
  }

  return "Não foi possível abrir a câmera. Você ainda pode digitar o código.";
}
