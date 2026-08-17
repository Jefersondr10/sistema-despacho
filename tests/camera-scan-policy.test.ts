import assert from "node:assert/strict";
import test from "node:test";

import {
  CAMERA_REARM_DELAY_MS,
  createCameraScanGate,
  getCameraErrorMessage,
  isRecoverableCameraReaderError,
  registerCameraDetection,
  registerCameraMiss,
} from "../app/bipagem/camera-scan-policy.ts";

test("a etiqueta mantida diante da câmera gera uma única leitura", () => {
  let gate = createCameraScanGate();
  const acceptedCodes: string[] = [];

  for (let frame = 0; frame < 30; frame += 1) {
    const detection = registerCameraDetection(gate, " ab 123 ");
    gate = detection.gate;
    if (detection.acceptedCode) {
      acceptedCodes.push(detection.acceptedCode);
    }
  }

  assert.deepEqual(acceptedCodes, ["ab 123"]);
});

test("preserva a estrutura do QR para separar rastreio de CEP", () => {
  const payload = "DESTINO 01001-010\nOBJETO AA123456785BR";
  const detection = registerCameraDetection(createCameraScanGate(), payload);

  assert.equal(detection.acceptedCode, payload);
  assert.equal(detection.gate.latchedCode, "DESTINO01001-010OBJETOAA123456785BR");
});

test("o mesmo código só é aceito novamente depois de sair do quadro", () => {
  let gate = registerCameraDetection(
    createCameraScanGate(),
    "AB123",
  ).gate;

  gate = registerCameraMiss(gate, 1_000);
  gate = registerCameraMiss(gate, 1_000 + CAMERA_REARM_DELAY_MS - 1);
  assert.equal(registerCameraDetection(gate, "AB123").acceptedCode, null);

  gate = registerCameraMiss(gate, 2_000);
  gate = registerCameraMiss(gate, 2_000 + CAMERA_REARM_DELAY_MS);
  assert.equal(registerCameraDetection(gate, "AB123").acceptedCode, "AB123");
});

test("um código diferente é aceito sem aguardar o rearme", () => {
  const first = registerCameraDetection(createCameraScanGate(), "AB123");
  const second = registerCameraDetection(first.gate, "CD456");

  assert.equal(first.acceptedCode, "AB123");
  assert.equal(second.acceptedCode, "CD456");
});

test("erros comuns da câmera oferecem mensagens acionáveis", () => {
  assert.match(
    getCameraErrorMessage({ name: "NotAllowedError" }),
    /Permissão da câmera negada/,
  );
  assert.match(
    getCameraErrorMessage({ name: "NotReadableError" }),
    /outro aplicativo/,
  );
  assert.match(
    getCameraErrorMessage({ name: "NotFoundError" }),
    /Nenhuma câmera/,
  );
});

test("erros de leitura do ZXing continuam recuperáveis no bundle minificado", () => {
  assert.equal(
    isRecoverableCameraReaderError({
      name: "e",
      getKind() {
        return "NotFoundException";
      },
    }),
    true,
  );
  assert.equal(
    isRecoverableCameraReaderError({
      name: "e",
      constructor: { kind: "ChecksumException" },
    }),
    true,
  );
  assert.equal(
    isRecoverableCameraReaderError({ name: "FormatException" }),
    true,
  );
  assert.equal(
    isRecoverableCameraReaderError({
      name: "NotReadableError",
      getKind() {
        return "DOMException";
      },
    }),
    false,
  );
});
