import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTrackingCode,
  type TrackingCodeContext,
} from "../app/bipagem/tracking-code-policy.ts";

function accepted(rawCode: string, context: TrackingCodeContext = {}) {
  const result = parseTrackingCode(rawCode, context);
  if (!result.accepted) assert.fail(result.message);
  return result;
}

function rejected(rawCode: string, context: TrackingCodeContext = {}) {
  const result = parseTrackingCode(rawCode, context);
  if (result.accepted) {
    assert.fail(`Codigo aceito indevidamente: ${result.code}`);
  }
  return result;
}

test("aceita codigo com formato de CEP e mostra somente um aviso", () => {
  const plain = accepted("01001010");
  const formatted = accepted("01001-010");

  assert.equal(plain.code, "01001010");
  assert.equal(formatted.code, "01001010");
  assert.match(plain.warning ?? "", /formato de CEP.*foi aceito/i);
  assert.match(formatted.warning ?? "", /formato de CEP.*foi aceito/i);
});

test("aceita o S10 dos Correios e o AWB completo da Azul", () => {
  assert.deepEqual(accepted("AA123456785BR"), {
    accepted: true,
    code: "AA123456785BR",
    extracted: false,
    kind: "correios-s10",
  });
  assert.deepEqual(accepted("57712345675"), {
    accepted: true,
    code: "57712345675",
    extracted: false,
    kind: "azul-awb",
  });
});

test("aceita formatos amplos usados por marketplaces e transportadoras", () => {
  accepted("TBA123456789012");
  accepted("BRSPX1234567890");
  accepted("MEL123456789012");
  accepted("1Z999AA10123456784");
  assert.equal(
    accepted("12345678901234567890", { carrier: "loggi" }).warning,
    undefined,
  );
  assert.equal(
    accepted("123456789011", { carrier: "jadlog" }).warning,
    undefined,
  );
  assert.match(
    accepted("123456789011", { carrier: "correios" }).warning ?? "",
    /aceito|seguran.a/i,
  );
});

test("aceita chave de nota fiscal com aviso mesmo quando a transportadora e Loggi", () => {
  const nfeKey = "35190830290856000160550010000000011000000010";

  assert.match(accepted(nfeKey).warning ?? "", /nota fiscal/i);
  assert.match(
    accepted(nfeKey, { carrier: "loggi" }).warning ?? "",
    /nota fiscal/i,
  );
});

test("aceita documentos, telefones, produto e numero ambiguo com aviso", () => {
  for (const code of [
    "52998224725",
    "529.982.247-25",
    "11222333000181",
    "11.222.333/0001-81",
    "11987654321",
    "5511987654321",
    "7894900011517",
    "123456789012",
    "123456789011",
  ]) {
    assert.ok(accepted(code).warning, `Aviso ausente para ${code}`);
  }
});

test("aceita pedido, identificador generico e URL nao rastreavel com aviso", () => {
  for (const value of [
    "PEDIDO 123456789012",
    JSON.stringify({ order_id: "123456789012" }),
    JSON.stringify({ customer: { id: "ABC1234567" } }),
    "https://loja.example/pedido/123456789012",
  ]) {
    assert.ok(accepted(value).warning);
  }
});

test("aceita sem alerta os rastreios observados nas etiquetas das plataformas", () => {
  const samples = [
    ["47809104041", "Mercado Livre"],
    ["47831596060", "Mercado Livre"],
    ["TBR418020241", "Amazon"],
    ["BR2684201032696", "Shopee"],
    ["AP395494633BR", "Mercado Livre"],
  ] as const;

  for (const [code, marketplace] of samples) {
    const result = accepted(code, { carrier: "Correios", marketplace });
    assert.equal(result.code, code);
    assert.equal(result.warning, undefined);
  }

  assert.ok(
    accepted("47809104041", { marketplace: "Amazon" }).warning,
    "O prefixo 478 só deve ser confiável no contexto do Mercado Livre",
  );
});

test("codigo numerico do Mercado Livre nao e acusado como CEP", () => {
  const result = accepted("47809104041", { marketplace: "Mercado Livre" });

  assert.equal(result.code, "47809104041");
  assert.equal(result.warning, undefined);

  const qrResult = accepted('{"id":"47809104041","t":"lm"}', {
    marketplace: "Mercado Livre",
  });
  assert.equal(qrResult.code, "47809104041");
  assert.equal(qrResult.warning, undefined);

  const checksumCollision = accepted("57712345678", {
    marketplace: "Mercado Livre",
  });
  assert.match(checksumCollision.warning ?? "", /d.gito verificador/i);
});

test("codigo simples preserva A mesmo quando o restante parece outro formato", () => {
  const values = [
    "A57712345675",
    "A57712345675B",
    "AAA123456785BR",
    "A35190830290856000160550010000000011000000010",
  ];

  for (const value of values) {
    assert.deepEqual(accepted(value), {
      accepted: true,
      code: value,
      extracted: false,
      kind: "carrier-code",
    });
  }

  assert.deepEqual(accepted("A 57712345675"), {
    accepted: true,
    code: "A57712345675",
    extracted: false,
    kind: "carrier-code",
  });
});

test("extrai o rastreio de URL, JSON e Data Matrix sem escolher o CEP", () => {
  assert.equal(
    accepted(
      "https://transportadora.example/rastreio?tracking_number=TBA123456789012&cep=01001010",
    ).code,
    "TBA123456789012",
  );
  assert.equal(
    accepted(
      JSON.stringify({ cep: "01001010", tracking_number: "BRSPX1234567890" }),
    ).code,
    "BRSPX1234567890",
  );
  assert.equal(
    accepted("DESTINO 01001-010 OBJETO AA123456785BR").code,
    "AA123456785BR",
  );
  assert.equal(
    accepted("https://transportadora.example/rastreio/123456789012").code,
    "123456789012",
  );
  const genericIdUrl = accepted(
    "https://transportadora.example/?id=123456789012",
  );
  assert.notEqual(genericIdUrl.code, "123456789012");
  assert.ok(genericIdUrl.warning);
  assert.equal(
    accepted(JSON.stringify({ tracking: { number: "123456789012" } })).code,
    "123456789012",
  );
  const shortExplicitTracking = accepted(
    JSON.stringify({ tracking_number: "12345678", cep: "01310100" }),
  );
  assert.equal(shortExplicitTracking.code, "12345678");
  assert.match(shortExplicitTracking.warning ?? "", /formato de CEP/i);
  const shortTrackingFromUrl = accepted(
    "https://transportadora.example/?tracking_number=ABC12&cep=01001010",
  );
  assert.equal(shortTrackingFromUrl.code, "ABC12");
  assert.notEqual(shortTrackingFromUrl.code, "NUMBER");

  const shortTrackingFromText = accepted("tracking number: ABC12");
  assert.equal(shortTrackingFromText.code, "ABC12");
  assert.notEqual(shortTrackingFromText.code, "NUMBER");
});

test("aceita a chave composta com aviso sem extrair um falso S10 do meio", () => {
  // A sequencia AD...BR parece um S10 por coincidencia, mas esta colada aos
  // demais campos da nota e nao e um rastreio independente da etiqueta.
  const payload =
    "76962176000007120505000000651AD771103325BR250" +
    "0000000000067059090072180003117PORTOCINZA000" +
    "00069993950585-00.000000-00.000000}47710669417}";

  const result = accepted(payload);
  assert.notEqual(result.code, "AD771103325BR");
  assert.ok(result.warning);
  assert.equal(
    accepted("NOTA 123 OBJETO AD771103325BR").code,
    "AD771103325BR",
  );
});

test("nao bloqueia formatos desconhecidos e mantem o aviso na tela", () => {
  assert.match(accepted("ABC12").warning ?? "", /foi aceito/i);
  assert.match(
    accepted("RUA CENTRAL\nCEP 01001-010\nSAO PAULO").warning ?? "",
    /pode n.o ser um rastreio/i,
  );
  assert.match(
    accepted("RUA CENTRAL CONDOMINIO123 CEP 01001-010 SAO PAULO")
      .warning ?? "",
    /pode n.o ser um rastreio/i,
  );
  assert.match(
    accepted("00020126580014BR.GOV.BCB.PIX0136123E4567E89B12D3A45642600000")
      .warning ?? "",
    /pode n.o ser um rastreio/i,
  );
});

test("preserva separadores que fazem parte da identidade ja salva", () => {
  assert.equal(accepted("abc-123456").code, "ABC-123456");
  assert.equal(accepted("ABC/123456").code, "ABC/123456");
});

test("aceita rastreios formatados com espaços sem aceitar endereços", () => {
  assert.equal(accepted("1Z 999 AA1 01 2345 6784").code, "1Z999AA10123456784");
  assert.equal(accepted("TBA 123456789012").code, "TBA123456789012");
});

test("aceita formatos fortes com digito verificador invalido e avisa", () => {
  for (const code of ["AA123456789BR", "57712345678", "1".repeat(44)]) {
    const result = accepted(code);
    assert.equal(result.code, code);
    assert.equal(result.kind, "carrier-code");
    assert.match(result.warning ?? "", /d.gito verificador.*Confira/i);
  }
});

test("continua rejeitando somente uma leitura vazia", () => {
  assert.equal(rejected("   ").reason, "empty");
});

test("um tracking_number explicito vence a chave de NF-e do mesmo QR", () => {
  assert.equal(
    accepted(
      JSON.stringify({
        tracking_number: "TBA123456789012",
        nfe: "35190830290856000160550010000000011000000010",
      }),
    ).code,
    "TBA123456789012",
  );
});
