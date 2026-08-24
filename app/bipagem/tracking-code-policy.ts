const POSTAL_CODE_PATTERN = /^\d{5}-?\d{3}$/;
const CORREIOS_S10_PATTERN = /^[A-Z]{2}\d{9}[A-Z]{2}$/;
const AZUL_AWB_PATTERN = /^577\d{8}$/;
const NFE_ACCESS_KEY_PATTERN = /^\d{44}$/;
const TRACKING_KEY_PATTERN =
  /(?:tracking(?:[_\s-]*(?:number|id|code))?|rastreio|c[oó]digo[_\s-]*(?:de[_\s-]*)?rastreio|awb|shipment(?:[_\s-]*(?:number|id))?|remessa|etiqueta|package(?:[_\s-]*(?:number|id))?|objeto)/i;
const PIX_PAYLOAD_PATTERN = /(?:^000201|BRGOVBCBPIX)/;
const ADDRESS_TEXT_PATTERN =
  /\b(?:CEP|RUA|AVENIDA|AV\.?|ALAMEDA|RODOVIA|ENDEREC[OÓ]|DESTINAT[AÁ]RIO|DESTINO|BAIRRO|CIDADE|CONDOM[IÍ]NIO)\b/i;
const NON_TRACKING_TEXT_PATTERN =
  /(?:^|[^A-Z])(?:CEP|RUA|AVENIDA|ALAMEDA|RODOVIA|ENDEREC[OÓ]|DESTINAT[AÁ]RIO|DESTINO|BAIRRO|CIDADE|CONDOM[IÍ]NIO|PEDIDO|ORDER|CPF|CNPJ|TELEFONE|FONE|WHATSAPP|CLIENTE|SKU|EAN|GTIN|PRODUTO|NOTA(?:\s*FISCAL)?)(?=$|[^A-Z])/i;
const KNOWN_CARRIER_CODE_PATTERN =
  /^(?:TBA\d{10,18}|BRSPX[A-Z0-9]{8,24}|MEL[A-Z0-9]{8,24}|1Z[A-Z0-9]{16})$/;
const MAX_TRACKING_LENGTH = 60;

export type TrackingCodeContext = {
  carrier?: string | null;
};

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
      reason:
        | "empty"
        | "postal-code"
        | "personal-document"
        | "phone"
        | "product-code"
        | "ambiguous"
        | "unsupported";
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

function hasRepeatedDigits(code: string) {
  return /^(\d)\1+$/.test(code);
}

function isValidCpf(code: string) {
  if (!/^\d{11}$/.test(code) || hasRepeatedDigits(code)) return false;

  const calculateDigit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(code[index]) * (length + 1 - index);
    }
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };

  return Number(code[9]) === calculateDigit(9) && Number(code[10]) === calculateDigit(10);
}

function isValidCnpj(code: string) {
  if (!/^\d{14}$/.test(code) || hasRepeatedDigits(code)) return false;

  const calculateDigit = (length: 12 | 13) => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce(
      (total, weight, index) => total + Number(code[index]) * weight,
      0,
    );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return Number(code[12]) === calculateDigit(12) && Number(code[13]) === calculateDigit(13);
}

function isLikelyBrazilianPhone(code: string) {
  const localCode = /^55\d{10,11}$/.test(code) ? code.slice(2) : code;
  if (!/^\d{10,11}$/.test(localCode)) return false;

  const areaCode = Number(localCode.slice(0, 2));
  if (areaCode < 11 || areaCode > 99) return false;

  return localCode.length === 11
    ? localCode[2] === "9"
    : /^[2-9]/.test(localCode[2]);
}

function isValidGtin(code: string) {
  if (![8, 12, 13, 14].includes(code.length) || !/^\d+$/.test(code)) {
    return false;
  }

  const data = code.slice(0, -1);
  let sum = 0;
  let weight = 3;
  for (let index = data.length - 1; index >= 0; index -= 1) {
    sum += Number(data[index]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return Number(code.at(-1)) === checkDigit;
}

function normalizeContextValue(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function allowsPlainNumericCarrierCode(
  code: string,
  context: TrackingCodeContext,
) {
  const carrier = normalizeContextValue(context.carrier);

  if (/(?:^|-)loggi(?:-|$)/.test(carrier)) {
    return code.length >= 20 && code.length <= 30;
  }
  if (/(?:^|-)jadlog(?:-|$)/.test(carrier)) {
    return code.length >= 9 && code.length <= 14;
  }
  if (/(?:^|-)total(?:-)?express(?:-|$)/.test(carrier)) {
    return code.length >= 9 && code.length <= 20;
  }

  return false;
}

function allowsNfeAccessKey(
  origin: CandidateOrigin,
  context: TrackingCodeContext,
) {
  return (
    origin === "preferred" ||
    /(?:^|-)loggi(?:-|$)/.test(normalizeContextValue(context.carrier))
  );
}

function isRejectedNumericIdentifier(code: string) {
  return (
    isValidCpf(code) ||
    isValidCnpj(code) ||
    isLikelyBrazilianPhone(code) ||
    isValidGtin(code)
  );
}

function classifyCandidate(
  value: string,
  origin: CandidateOrigin,
  context: TrackingCodeContext,
): Omit<Candidate, "score"> | null {
  const normalizedCode = normalizeCandidateValue(value);
  const compactCode = canonicalizeCandidate(normalizedCode);

  if (
    !compactCode ||
    normalizedCode.length > MAX_TRACKING_LENGTH ||
    /^\d{8}$/.test(compactCode) ||
    NON_TRACKING_TEXT_PATTERN.test(normalizedCode) ||
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
    return isValidNfeAccessKey(compactCode) &&
      allowsNfeAccessKey(origin, context)
      ? { code: compactCode, kind: "nfe-access-key" }
      : null;
  }

  if (KNOWN_CARRIER_CODE_PATTERN.test(compactCode)) {
    return { code: compactCode, kind: "carrier-code" };
  }

  const hasLetter = /[A-Z]/.test(compactCode);
  const hasDigit = /\d/.test(compactCode);

  if (hasLetter && hasDigit) {
    if (origin === "embedded") return null;
    const minimumLength = 6;
    return compactCode.length >= minimumLength
      ? { code: normalizedCode, kind: "carrier-code" }
      : null;
  }

  if (/^\d+$/.test(compactCode)) {
    if (
      origin !== "preferred" &&
      isRejectedNumericIdentifier(compactCode)
    ) {
      return null;
    }

    const hasReliableOrigin =
      origin === "preferred" ||
      (origin === "plain" &&
        allowsPlainNumericCarrierCode(compactCode, context));
    return hasReliableOrigin && compactCode.length >= 9 && compactCode.length <= 30
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
  keyPath = "",
) {
  if (typeof value === "string" || typeof value === "number") {
    addCandidate(
      String(value),
      TRACKING_KEY_PATTERN.test(keyPath) ? "preferred" : "embedded",
    );
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStructuredValues(item, addCandidate, keyPath));
    return;
  }

  if (typeof value === "object" && value) {
    Object.entries(value).forEach(([entryKey, entryValue]) => {
      const nextPath = keyPath ? `${keyPath}.${entryKey}` : entryKey;
      collectStructuredValues(entryValue, addCandidate, nextPath);
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

export function parseTrackingCode(
  rawValue: string,
  context: TrackingCodeContext = {},
): TrackingCodeResult {
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
  if (
    POSTAL_CODE_PATTERN.test(compactWhole) ||
    (/^\d{8}$/.test(canonicalWhole) && /^[\d\s-]+$/.test(decoded))
  ) {
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
    const classified = classifyCandidate(value, origin, context);
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
    !NON_TRACKING_TEXT_PATTERN.test(decoded) &&
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
  upperPayload.match(/\bTBA\d{10,18}\b/g)?.forEach((value) => {
    addCandidate(value, "embedded");
  });
  upperPayload.match(/\bBRSPX[A-Z0-9]{8,24}\b/g)?.forEach((value) => {
    addCandidate(value, "embedded");
  });
  upperPayload.match(/\bMEL[A-Z0-9]{8,24}\b/g)?.forEach((value) => {
    addCandidate(value, "embedded");
  });
  upperPayload.match(/\b1Z[A-Z0-9]{16}\b/g)?.forEach((value) => {
    addCandidate(value, "embedded");
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
    /(?:tracking(?:[_\s-]*(?:number|id|code))?|rastreio|c[oó]digo[_\s-]*(?:de[_\s-]*)?rastreio|awb|shipment(?:[_\s-]*(?:number|id))?|remessa|etiqueta|package(?:[_\s-]*(?:number|id))?|objeto)[\s:=/_-]+([A-Z0-9._/-]{6,60})/gi;
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
    const wholeIsPersonalDocument =
      isValidCpf(canonicalWhole) || isValidCnpj(canonicalWhole);
    const wholeIsPhone = isLikelyBrazilianPhone(canonicalWhole);
    const wholeIsProductCode = isValidGtin(canonicalWhole);
    const wholeIsAmbiguousNumber = /^\d{9,43}$/.test(canonicalWhole);

    if (wholeIsPersonalDocument) {
      return {
        accepted: false,
        reason: "personal-document",
        message: "Este código parece ser CPF ou CNPJ, não um rastreio de remessa.",
      };
    }
    if (wholeIsPhone) {
      return {
        accepted: false,
        reason: "phone",
        message: "Este código parece ser um telefone, não um rastreio de remessa.",
      };
    }
    if (wholeIsProductCode) {
      return {
        accepted: false,
        reason: "product-code",
        message: "Este código parece ser o código de barras de um produto, não o rastreio da remessa.",
      };
    }
    if (wholeIsAmbiguousNumber) {
      return {
        accepted: false,
        reason: "ambiguous",
        message:
          "Este número não foi reconhecido com segurança como rastreio. Leia o código da etiqueta da remessa.",
      };
    }

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
