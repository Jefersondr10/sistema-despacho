import assert from "node:assert/strict";
import test from "node:test";

import { parseTrackingCode } from "../app/bipagem/tracking-code-policy.ts";

function accepted(rawCode: string) {
  const result = parseTrackingCode(rawCode);
  if (!result.accepted) assert.fail(result.message);
  return result;
}

function rejected(rawCode: string) {
  const result = parseTrackingCode(rawCode);
  if (result.accepted) {
    assert.fail(`Codigo aceito indevidamente: ${result.code}`);
  }
  return result;
}

test("rejeita CEP isolado com ou sem hifen", () => {
  rejected("01001010");
  rejected("01001-010");
  assert.equal(rejected("01001010").reason, "postal-code");
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
  accepted("12345678901234567890");
  assert.equal(
    accepted("35190830290856000160550010000000011000000010").kind,
    "nfe-access-key",
  );
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
  assert.equal(
    accepted("https://transportadora.example/?id=123456789012").code,
    "123456789012",
  );
  assert.equal(
    accepted(JSON.stringify({ tracking: { number: "123456789012" } })).code,
    "123456789012",
  );
});

test("nao aceita texto curto ou um QR que contenha somente endereco e CEP", () => {
  rejected("ABC12");
  const result = rejected("RUA CENTRAL\nCEP 01001-010\nSAO PAULO");
  assert.equal(result.reason, "postal-code");
  rejected("RUA CENTRAL CONDOMINIO123 CEP 01001-010 SAO PAULO");
  rejected("00020126580014BR.GOV.BCB.PIX0136123E4567E89B12D3A45642600000");
});

test("preserva separadores que fazem parte da identidade ja salva", () => {
  assert.equal(accepted("abc-123456").code, "ABC-123456");
  assert.equal(accepted("ABC/123456").code, "ABC/123456");
});

test("aceita rastreios formatados com espaços sem aceitar endereços", () => {
  assert.equal(accepted("1Z 999 AA1 01 2345 6784").code, "1Z999AA10123456784");
  assert.equal(accepted("TBA 123456789012").code, "TBA123456789012");
});

test("rejeita formatos fortes com dígito verificador inválido", () => {
  rejected("AA123456789BR");
  rejected("57712345678");
  rejected("1".repeat(44));
});

test("um tracking_number explicito vence a chave de NF-e do mesmo QR", () => {
  assert.equal(
    accepted(
      JSON.stringify({
        tracking_number: "TBA123456789012",
        nfe: "1".repeat(44),
      }),
    ).code,
    "TBA123456789012",
  );
});
