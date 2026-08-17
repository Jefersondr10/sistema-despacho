import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createCameraAudioFeedbackController,
  getCameraAudioCue,
} from "../app/bipagem/camera-audio-feedback.ts";
import { CAMERA_LOGISTICS_BARCODE_FORMAT_NAMES } from "../app/bipagem/camera-scan-policy.ts";

test("os sinais de sucesso, aviso e erro possuem assinaturas diferentes", () => {
  const success = getCameraAudioCue("success");
  const warning = getCameraAudioCue("warning");
  const danger = getCameraAudioCue("danger");

  assert.equal(success.length, 1);
  assert.equal(warning.length, 2);
  assert.equal(danger.length, 2);
  assert.notDeepEqual(warning, danger);
  assert.ok(success[0].durationSeconds < warning[1].durationSeconds);
  assert.ok(danger[1].frequencyHz < warning[1].frequencyHz);
});

test("o bip de sucesso fica mais agudo no volume máximo sem alterar aviso ou erro", () => {
  const success = getCameraAudioCue("success");
  const warning = getCameraAudioCue("warning");
  const danger = getCameraAudioCue("danger");

  assert.deepEqual(success, [
    {
      delaySeconds: 0,
      durationSeconds: 0.075,
      frequencyHz: 2_100,
      oscillatorType: "sine",
      volume: 1,
    },
  ]);
  assert.ok(
    success[0].frequencyHz >
      Math.max(...warning.map((note) => note.frequencyHz)),
  );
  assert.deepEqual(warning, [
    {
      delaySeconds: 0,
      durationSeconds: 0.09,
      frequencyHz: 440,
      oscillatorType: "square",
      volume: 0.1,
    },
    {
      delaySeconds: 0.13,
      durationSeconds: 0.12,
      frequencyHz: 330,
      oscillatorType: "square",
      volume: 0.1,
    },
  ]);
  assert.deepEqual(danger, [
    {
      delaySeconds: 0,
      durationSeconds: 0.12,
      frequencyHz: 240,
      oscillatorType: "sawtooth",
      volume: 0.1,
    },
    {
      delaySeconds: 0.15,
      durationSeconds: 0.17,
      frequencyHz: 155,
      oscillatorType: "sawtooth",
      volume: 0.1,
    },
  ]);
});

test("o leitor inclui formatos logísticos 1D e 2D sem EAN ou UPC de produto", () => {
  assert.deepEqual(
    CAMERA_LOGISTICS_BARCODE_FORMAT_NAMES.filter((format) =>
      ["QR_CODE", "DATA_MATRIX", "PDF_417", "AZTEC"].includes(format),
    ),
    ["QR_CODE", "DATA_MATRIX", "PDF_417", "AZTEC"],
  );
  assert.ok(CAMERA_LOGISTICS_BARCODE_FORMAT_NAMES.includes("CODE_128"));
  assert.ok(CAMERA_LOGISTICS_BARCODE_FORMAT_NAMES.includes("ITF"));
  assert.equal(
    CAMERA_LOGISTICS_BARCODE_FORMAT_NAMES.some(
      (format) => format.startsWith("EAN") || format.startsWith("UPC"),
    ),
    false,
  );
});

test("o contexto de áudio é preparado por gesto e encerrado com a câmera", () => {
  let resumeCalls = 0;
  let closeCalls = 0;
  const fakeContext = {
    state: "suspended",
    resume() {
      resumeCalls += 1;
      return Promise.resolve();
    },
    close() {
      closeCalls += 1;
      return Promise.resolve();
    },
  } as unknown as AudioContext;
  const audio = createCameraAudioFeedbackController(() => fakeContext);

  audio.prime();
  audio.close();

  assert.equal(resumeCalls, 1);
  assert.equal(closeCalls, 1);
});

test("uma falha de áudio nunca altera o resultado já processado", () => {
  const fakeContext = {
    state: "running",
    currentTime: 0,
    createOscillator() {
      throw new Error("audio indisponível");
    },
  } as unknown as AudioContext;
  const audio = createCameraAudioFeedbackController(() => fakeContext);

  audio.prime();
  assert.doesNotThrow(() => audio.play("success"));
});

test("o som é disparado somente após o retorno do processamento da leitura", () => {
  const scannerSource = readFileSync(
    new URL("../app/bipagem/mobile-camera-scanner.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    scannerSource,
    /\.current\(detection\.acceptedCode\)[\s\S]*?\.then\(\(outcome\) => \{[\s\S]*?audioFeedback\.play\(outcome\.tone\)/,
  );
  assert.doesNotMatch(
    scannerSource,
    /registerCameraDetection[\s\S]{0,300}audioFeedback\.play/,
  );
});
