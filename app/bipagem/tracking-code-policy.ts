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
const POSTAL_CODE_WARNING =
  "Atenção: este código tem formato de CEP, mas foi aceito. Confira se é o rastreio correto.";
const UNRECOGNIZED_CODE_WARNING =
  "Atenção: o código foi aceito, mas o formato não pôde ser confirmado. Confira a leitura.";
const CHECK_DIGIT_WARNING =
  "Atenção: o código foi aceito, mas o dígito verificador não pôde ser confirmado. Confira a leitura.";
const NON_SHIPPING_PAYLOAD_WARNING =
  "Atenção: o conteúdo foi aceito, mas pode não ser um rastreio de remessa. Confira a leitura.";
const PERSONAL_DOCUMENT_WARNING =
  "Atenção: o código foi aceito, mas parece ser CPF ou CNPJ. Confira se é o rastreio correto.";
const PHONE_WARNING =
  "Atenção: o código foi aceito, mas parece ser um telefone. Confira se é o rastreio correto.";
const PRODUCT_CODE_WARNING =
  "Atenção: o código foi aceito, mas parece ser um código de produto. Confira se é o rastreio correto.";
const INVOICE_KEY_WARNING =
  "Atenção: o código foi aceito, mas parece ser uma chave de nota fiscal. Confira se é o rastreio correto.";
const AMBIGUOUS_NUMBER_WARNING =
  "Atenção: o número foi aceito, mas não foi reconhecido com segurança como rastreio. Confira a leitura.";

export type TrackingCodeContext = {
  carrier?: string | null;
  marketplace?: string | null;
};

export type TrackingCodeKind =
  | "correios-s10"
  | "azul-awb"
  | "carrier-code";

export type TrackingCodeResult =
  | {
      accepted: true;
      code: string;
      extracted: boolean;
      kind: TrackingCodeKind;
      warning?: string;
    }
  | {
      accepted: false;
      reason: "empty";
      message: string;
    };

type CandidateOrigin = "plain" | "preferred" | "embedded";

type Candidate = {
  code: string;
  kind: TrackingCodeKind;
  score: number;
  warning?: string;
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

function normalizeMarketplaceName(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isKnownMarketplaceTrackingCode(
  code: string,
  context: TrackingCodeContext,
) {
  const marketplace = normalizeMarketplaceName(context.marketplace);
  const isMercadoLivre =
    marketplace.includes("mercadolivre") ||
    marketplace.includes("mercadolibre");

  if (isMercadoLivre) {
    return /^478\d{8}$/.test(code) || /^AP\d{9}BR$/.test(code);
  }

  if (marketplace.includes("amazon")) {
    return /^TBR[A-Z0-9]{8,24}$/.test(code);
  }

  if (marketplace.includes("shopee")) {
    return /^BR\d{10,20}$/.test(code);
  }

  return false;
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
    NON_TRACKING_TEXT_PATTERN.test(normalizedCode) ||
    !/^[A-Z0-9._/-]+$/.test(normalizedCode)
  ) {
    return null;
  }

  if (isKnownMarketplaceTrackingCode(compactCode, context)) {
    return { code: compactCode, kind: "carrier-code" };
  }

  if (CORREIOS_S10_PATTERN.test(compactCode)) {
    return isValidCorreiosS10(compactCode)
      ? { code: compactCode, kind: "correios-s10" }
      : {
          code: compactCode,
          kind: "carrier-code",
          warning: CHECK_DIGIT_WARNING,
        };
  }

  if (AZUL_AWB_PATTERN.test(compactCode)) {
    return isValidAirWaybill(compactCode)
      ? { code: compactCode, kind: "azul-awb" }
      : {
          code: compactCode,
          kind: "carrier-code",
          warning: CHECK_DIGIT_WARNING,
        };
  }

  if (NFE_ACCESS_KEY_PATTERN.test(compactCode)) {
    return isValidNfeAccessKey(compactCode)
      ? {
          code: compactCode,
          kind: "carrier-code",
          warning: INVOICE_KEY_WARNING,
        }
      : {
          code: compactCode,
          kind: "carrier-code",
          warning: CHECK_DIGIT_WARNING,
        };
  }

  if (KNOWN_CARRIER_CODE_PATTERN.test(compactCode)) {
    return { code: compactCode, kind: "carrier-code" };
  }

  const hasLetter = /[A-Z]/.test(compactCode);
  const hasDigit = /\d/.test(compactCode);

  if (hasLetter && hasDigit) {
    const minimumLength = origin === "embedded" ? 10 : 6;
    if (compactCode.length >= minimumLength) {
      return {
        code: normalizedCode,
        kind: "carrier-code",
        ...(origin === "embedded"
          ? { warning: UNRECOGNIZED_CODE_WARNING }
          : {}),
      };
    }

    return origin === "embedded"
      ? null
      : {
          code: normalizedCode,
          kind: "carrier-code",
          warning: UNRECOGNIZED_CODE_WARNING,
        };
  }

  if (/^\d+$/.test(compactCode)) {
    if (origin === "plain" || origin === "preferred") {
      if (/^\d{8}$/.test(compactCode)) {
        return {
          code: compactCode,
          kind: "carrier-code",
          warning: POSTAL_CODE_WARNING,
        };
      }

      if (origin !== "preferred" && isRejectedNumericIdentifier(compactCode)) {
        const warning = isValidCpf(compactCode) || isValidCnpj(compactCode)
          ? PERSONAL_DOCUMENT_WARNING
          : isLikelyBrazilianPhone(compactCode)
            ? PHONE_WARNING
            : PRODUCT_CODE_WARNING;

        return { code: normalizedCode, kind: "carrier-code", warning };
      }

      const hasReliableOrigin =
        origin === "preferred" ||
        (origin === "plain" &&
          allowsPlainNumericCarrierCode(compactCode, context));
      if (
        hasReliableOrigin &&
        compactCode.length >= 9 &&
        compactCode.length <= 30
      ) {
        return { code: normalizedCode, kind: "carrier-code" };
      }

      return {
        code: normalizedCode,
        kind: "carrier-code",
        warning: /^\d{9,43}$/.test(compactCode)
          ? AMBIGUOUS_NUMBER_WARNING
          : UNRECOGNIZED_CODE_WARNING,
      };
    }

    return null;
  }

  if (origin !== "embedded") {
    return {
      code: normalizedCode,
      kind: "carrier-code",
      warning: UNRECOGNIZED_CODE_WARNING,
    };
  }

  return null;
}

function baseScore(kind: TrackingCodeKind) {
  if (kind === "correios-s10") return 1_000;
  if (kind === "azul-awb") return 950;
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
  const looksLikePixPayload = PIX_PAYLOAD_PATTERN.test(canonicalWhole);

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
  for (const match of upperPayload.matchAll(
    /(?:^|[^A-Z0-9])([A-Z]{2}\d{9}[A-Z]{2})(?![A-Z0-9])/g,
  )) {
    addCandidate(match[1], "embedded");
  }
  for (const match of upperPayload.matchAll(
    /(?:^|[^A-Z0-9])(577\d{8})(?![A-Z0-9])/g,
  )) {
    addCandidate(match[1], "embedded");
  }
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
  upperPayload
    .match(/\b(?:478\d{8}|AP\d{9}BR|TBR[A-Z0-9]{8,24}|BR\d{10,20})\b/g)
    ?.forEach((value) => {
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
    /(?:tracking(?:[_\s-]*(?:number|id|code))|tracking(?![_\s-]*(?:number|id|code))|rastreio|c[oó]digo[_\s-]*(?:de[_\s-]*)?rastreio|awb|shipment(?:[_\s-]*(?:number|id))?|remessa|etiqueta|package(?:[_\s-]*(?:number|id))?|objeto)[\s:=/_-]+([A-Z0-9._/-]{1,60})/gi;
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
    const containsNfeAccessKey = [...upperPayload.matchAll(
      /(?:^|\D)(\d{44})(?!\d)/g,
    )].some((match) => isValidNfeAccessKey(match[1]));
    const wholeIsPersonalDocument =
      isValidCpf(canonicalWhole) || isValidCnpj(canonicalWhole);
    const wholeIsPhone = isLikelyBrazilianPhone(canonicalWhole);
    const wholeIsProductCode = isValidGtin(canonicalWhole);
    const wholeIsAmbiguousNumber = /^\d{9,43}$/.test(canonicalWhole);

    const warning = wholeIsPersonalDocument
      ? PERSONAL_DOCUMENT_WARNING
      : wholeIsPhone
        ? PHONE_WARNING
        : wholeIsProductCode
          ? PRODUCT_CODE_WARNING
          : containsNfeAccessKey
            ? INVOICE_KEY_WARNING
            : wholeIsAmbiguousNumber
              ? AMBIGUOUS_NUMBER_WARNING
              : containsPostalCode ||
                  looksLikePixPayload ||
                  NON_TRACKING_TEXT_PATTERN.test(decoded)
                ? NON_SHIPPING_PAYLOAD_WARNING
                : UNRECOGNIZED_CODE_WARNING;

    return {
      accepted: true,
      code: compactWhole || normalizeCandidateValue(trimmed),
      extracted: false,
      kind: "carrier-code",
      warning,
    };
  }

  const selectedCanonical = canonicalizeCandidate(selected.code);
  let warning = selected.warning;

  if (isKnownMarketplaceTrackingCode(selectedCanonical, context)) {
    warning = undefined;
  } else if (/^\d{8}$/.test(selectedCanonical)) {
    warning = POSTAL_CODE_WARNING;
  } else if (looksLikePixPayload) {
    warning = NON_SHIPPING_PAYLOAD_WARNING;
  }

  return {
    accepted: true,
    code: selected.code,
    extracted: selectedCanonical !== canonicalWhole,
    kind: selected.kind,
    ...(warning ? { warning } : {}),
  };
}
