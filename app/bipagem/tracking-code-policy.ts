const POSTAL_CODE_PATTERN = /^\d{5}-?\d{3}$/;
const CORREIOS_S10_PATTERN = /^[A-Z]{2}\d{9}[A-Z]{2}$/;
const AZUL_AWB_PATTERN = /^577\d{8}$/;
const NFE_ACCESS_KEY_PATTERN = /^\d{44}$/;
const TRACKING_KEY_PATTERN =
  /(?:tracking(?:_number|_id)?|rastreio|c[oó]digo|code|awb|shipment|remessa|etiqueta|package|objeto|^id$|^number$|^n[uú]mero$)/i;
const PIX_PAYLOAD_PATTERN = /(?:^000201|BRGOVBCBPIX)/;
const ADDRESS_TEXT_PATTERN =
  /\b(?:CEP|RUA|AVENIDA|AV\.?|ALAMEDA|RODOVIA|ENDEREC[OÓ]|DESTINAT[AÁ]RIO|DESTINO|BAIRRO|CIDADE|CONDOM[IÍ]NIO)\b/i;
const MAX_TRACKING_LENGTH = 60;

export type TrackingCodeKind =
  | "correios-s10"
  | "azul-awb"
  | "nfe-access-key"
  | "carrier-code";

export type TrackingCodeResult =
  | {
      accepted: true;
      code: string;
      extracted: boolean;
      kind: TrackingCodeKind;
    }
  | {
      accepted: false;
      reason: "empty" | "postal-code" | "unsupported";
      message: string;
    };

type CandidateOrigin = "plain" | "preferred" | "embedded";

type Candidate = {
  code: string;
  kind: TrackingCodeKind;
  score: number;
};

function canonicalizeCandidate(value: string) {
  return normalizeCandidateValue(value).replace(/[^A-Z0-9]/g, "");
}

function normalizeCandidateValue(value: string) {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/\s+/g, "");
}

function isValidCorreiosS10(code: string) {
  if (!CORREIOS_S10_PATTERN.test(code)) return false;

  const weights = [8, 6, 4, 2, 3, 5, 9, 7];
  const serial = code.slice(2, 10);
  const sum = [...serial].reduce(
    (total, digit, index) => total + Number(digit) * weights[index],
    0,
  );
  let checkDigit = 11 - (sum % 11);
  if (checkDigit === 10) checkDigit = 0;
  if (checkDigit === 11) checkDigit = 5;
  return Number(code[10]) === checkDigit;
}

function isValidAirWaybill(code: string) {
  if (!AZUL_AWB_PATTERN.test(code)) return false;
  return Number(code.slice(3, 10)) % 7 === Number(code[10]);
}

function isValidNfeAccessKey(code: string) {
  if (!NFE_ACCESS_KEY_PATTERN.test(code)) return false;

  const body = code.slice(0, 43);
  let weight = 2;
  let sum = 0;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const checkDigit = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
  return Number(code[43]) === checkDigit;
}

function classifyCandidate(
  value: string,
  origin: CandidateOrigin,
): Omit<Candidate, "score"> | null {
  const normalizedCode = normalizeCandidateValue(value);
  const compactCode = canonicalizeCandidate(normalizedCode);

  if (
    !compactCode ||
    normalizedCode.length > MAX_TRACKING_LENGTH ||
    /^\d{8}$/.test(compactCode) ||
    !/^[A-Z0-9._/-]+$/.test(normalizedCode)
  ) {
    return null;
  }

  if (CORREIOS_S10_PATTERN.test(compactCode)) {
    return isValidCorreiosS10(compactCode)
      ? { code: compactCode, kind: "correios-s10" }
      : null;
  }

  if (AZUL_AWB_PATTERN.test(compactCode)) {
    return isValidAirWaybill(compactCode)
      ? { code: compactCode, kind: "azul-awb" }
      : null;
  }

  if (NFE_ACCESS_KEY_PATTERN.test(compactCode)) {
    return isValidNfeAccessKey(compactCode)
      ? { code: compactCode, kind: "nfe-access-key" }
      : null;
  }

  const hasLetter = /[A-Z]/.test(compactCode);
  const hasDigit = /\d/.test(compactCode);

  if (hasLetter && hasDigit) {
    const minimumLength = origin === "embedded" ? 10 : 6;
    return compactCode.length >= minimumLength
      ? { code: normalizedCode, kind: "carrier-code" }
      : null;
  }

  if (/^\d+$/.test(compactCode)) {
    if (origin === "plain" || origin === "preferred") {
      return compactCode.length >= 9
        ? { code: normalizedCode, kind: "carrier-code" }
        : null;
    }

    // Em QR/Data Matrix compostos, numeros curtos podem ser CEP, pedido,
    // documento ou endereco. Loggi publica suporte a numeros com 20+ digitos
    // e a chaves de NF-e; esses formatos continuam aceitos com seguranca.
    return compactCode.length >= 20
      ? { code: normalizedCode, kind: "carrier-code" }
      : null;
  }

  return null;
}

function baseScore(kind: TrackingCodeKind) {
  if (kind === "correios-s10") return 1_000;
  if (kind === "azul-awb") return 950;
  if (kind === "nfe-access-key") return 900;
  return 600;
}

function originScore(origin: CandidateOrigin) {
  if (origin === "plain") return 180;
  if (origin === "preferred") return 500;
  return 0;
}

function collectStructuredValues(
  value: unknown,
  addCandidate: (value: string, origin: CandidateOrigin) => void,
  key = "",
) {
  if (typeof value === "string" || typeof value === "number") {
    addCandidate(
      String(value),
      TRACKING_KEY_PATTERN.test(key) ? "preferred" : "embedded",
    );
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStructuredValues(item, addCandidate, key));
    return;
  }

  if (typeof value === "object" && value) {
    Object.entries(value).forEach(([entryKey, entryValue]) => {
      collectStructuredValues(entryValue, addCandidate, entryKey);
    });
  }
}

function decodePayload(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseTrackingCode(rawValue: string): TrackingCodeResult {
  const trimmed = String(rawValue ?? "").trim();

  if (!trimmed) {
    return {
      accepted: false,
      reason: "empty",
      message: "Informe ou leia o código de rastreio do pacote.",
    };
  }

  const decoded = decodePayload(trimmed);
  const compactWhole = normalizeCandidateValue(decoded);
  const canonicalWhole = canonicalizeCandidate(compactWhole);
  if (POSTAL_CODE_PATTERN.test(compactWhole)) {
    return {
      accepted: false,
      reason: "postal-code",
      message:
        "Este código parece ser um CEP. Leia o rastreio da remessa; na Azul Cargo, use o AWB completo iniciado por 577.",
    };
  }

  if (PIX_PAYLOAD_PATTERN.test(canonicalWhole)) {
    return {
      accepted: false,
      reason: "unsupported",
      message:
        "Este QR não parece ser uma etiqueta de envio. Aponte para o rastreio da remessa.",
    };
  }

  const candidates = new Map<string, Candidate>();
  let authoritativePlainCode: Candidate | null = null;
  const addCandidate = (value: string, origin: CandidateOrigin) => {
    const classified = classifyCandidate(value, origin);
    if (!classified) return;

    const score =
      baseScore(classified.kind) +
      originScore(origin) +
      Math.min(classified.code.length, MAX_TRACKING_LENGTH) / 100;
    const candidate = { ...classified, score };

    // Quando a entrada inteira foi reconhecida como codigo simples, ela e a
    // identidade autoritativa. Candidatos internos nao podem descartar prefixos
    // legitimos, inclusive quando o operador digitou o codigo com espacos.
    if (
      origin === "plain" &&
      canonicalizeCandidate(classified.code) === canonicalWhole
    ) {
      authoritativePlainCode = candidate;
    }

    const previous = candidates.get(classified.code);
    if (!previous || score > previous.score) {
      candidates.set(classified.code, candidate);
    }
  };

  if (
    compactWhole.length <= MAX_TRACKING_LENGTH &&
    (CORREIOS_S10_PATTERN.test(canonicalWhole) ||
      AZUL_AWB_PATTERN.test(canonicalWhole) ||
      NFE_ACCESS_KEY_PATTERN.test(canonicalWhole))
  ) {
    addCandidate(compactWhole, "plain");
  }

  const looksLikePlainCode =
    !/\s/.test(decoded) &&
    compactWhole.length <= MAX_TRACKING_LENGTH &&
    /^[A-Z0-9._/-]+$/.test(compactWhole);
  if (looksLikePlainCode) {
    addCandidate(compactWhole, "plain");
  }

  const formattedTokens = decoded.trim().split(/\s+/);
  const looksLikeFormattedCode =
    /\s/.test(decoded) &&
    !/[\r\n]/.test(decoded) &&
    formattedTokens.length <= 8 &&
    !ADDRESS_TEXT_PATTERN.test(decoded) &&
    compactWhole.length <= MAX_TRACKING_LENGTH &&
    /^[A-Z0-9._/\-\s]+$/i.test(decoded);
  if (looksLikeFormattedCode) {
    addCandidate(compactWhole, "plain");
  }

  // Formatos de alta confianca podem aparecer dentro de um Data Matrix maior.
  const upperPayload = decoded.toUpperCase();
  upperPayload.match(/[A-Z]{2}\d{9}[A-Z]{2}/g)?.forEach((value) => {
    addCandidate(value, "embedded");
  });
  upperPayload.match(/(?:^|\D)(577\d{8})(?!\d)/g)?.forEach((value) => {
    const match = value.match(/577\d{8}/);
    if (match) addCandidate(match[0], "embedded");
  });
  upperPayload.match(/(?:^|\D)(\d{44})(?!\d)/g)?.forEach((value) => {
    const match = value.match(/\d{44}/);
    if (match) addCandidate(match[0], "embedded");
  });

  try {
    const url = new URL(decoded);
    url.searchParams.forEach((value, key) => {
      addCandidate(
        value,
        TRACKING_KEY_PATTERN.test(key) ? "preferred" : "embedded",
      );
    });
    const pathSegments = url.pathname.split("/").filter(Boolean);
    pathSegments.forEach((value, index) => {
      const previousSegment = pathSegments[index - 1] ?? "";
      const isLikelyTrackingSegment =
        index === pathSegments.length - 1 ||
        TRACKING_KEY_PATTERN.test(previousSegment);
      addCandidate(value, isLikelyTrackingSegment ? "preferred" : "embedded");
    });
  } catch {
    // O conteudo tambem pode ser um codigo simples, JSON ou texto estruturado.
  }

  try {
    collectStructuredValues(JSON.parse(decoded), addCandidate);
  } catch {
    // QR codes de transportadoras nem sempre usam JSON.
  }

  const preferredPattern =
    /(?:tracking(?:_number|_id)?|rastreio|c[oó]digo|code|awb|shipment|remessa|etiqueta|package)[\s:=/_-]+([A-Z0-9._/-]{6,60})/gi;
  for (const match of decoded.matchAll(preferredPattern)) {
    addCandidate(match[1], "preferred");
  }

  const selected =
    authoritativePlainCode ??
    [...candidates.values()].sort(
      (left, right) => right.score - left.score,
    )[0];

  if (!selected) {
    const containsPostalCode = /(?:^|\D)\d{5}-?\d{3}(?!\d)/.test(decoded);
    return {
      accepted: false,
      reason: containsPostalCode ? "postal-code" : "unsupported",
      message: containsPostalCode
        ? "O QR lido contém um CEP, mas nenhum rastreio válido. Aponte para o código da remessa."
        : "O código lido não foi reconhecido como rastreio. Leia o QR ou código de barras da remessa, não o CEP.",
    };
  }

  return {
    accepted: true,
    code: selected.code,
    extracted: selected.code !== compactWhole,
    kind: selected.kind,
  };
}
