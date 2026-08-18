"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createCameraAudioFeedbackController,
} from "./camera-audio-feedback";
import {
  CAMERA_LOGISTICS_BARCODE_FORMAT_NAMES,
  createCameraScanGate,
  getCameraErrorMessage,
  isRecoverableCameraReaderError,
  registerCameraDetection,
  registerCameraMiss,
  type CameraScanGate,
} from "./camera-scan-policy";

type ScannerControls = {
  stop: () => void | Promise<void>;
};

type CameraStatus = "idle" | "starting" | "active" | "processing" | "paused" | "error";

export type CameraScanOutcome = {
  tone: "success" | "warning" | "danger";
  message: string;
  accepted: boolean;
  code?: string;
};

function safelyStopControls(controls: ScannerControls | null) {
  if (!controls) {
    return;
  }

  try {
    void Promise.resolve(controls.stop()).catch(() => undefined);
  } catch {
    // O stream tambem e encerrado diretamente pelo elemento de video.
  }
}

function safelyVibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Feedback tatil e opcional e nunca altera o resultado da bipagem.
  }
}

type MobileCameraScannerProps = {
  busy: boolean;
  disabled: boolean;
  disabledMessage: string;
  pause: boolean;
  onDetected: (code: string) => Promise<CameraScanOutcome>;
};

export function MobileCameraScanner({
  busy,
  disabled,
  disabledMessage,
  pause,
  onDetected,
}: MobileCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const ownedStreamRef = useRef<MediaStream | null>(null);
  const trackCleanupRef = useRef<(() => void) | null>(null);
  const openingRef = useRef(false);
  const startTokenRef = useRef(0);
  const mountedRef = useRef(true);
  const processingRef = useRef(false);
  const busyRef = useRef(busy);
  const onDetectedRef = useRef(onDetected);
  const gateRef = useRef<CameraScanGate>(createCameraScanGate());
  const [audioFeedback] = useState(createCameraAudioFeedbackController);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [openingPending, setOpeningPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [scanFeedback, setScanFeedback] = useState<CameraScanOutcome | null>(
    null,
  );

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const releaseCamera = useCallback(() => {
    startTokenRef.current += 1;
    trackCleanupRef.current?.();
    trackCleanupRef.current = null;
    safelyStopControls(controlsRef.current);
    controlsRef.current = null;

    const ownedStream = ownedStreamRef.current;
    ownedStreamRef.current = null;
    ownedStream?.getTracks().forEach((track) => track.stop());

    const previewStream = videoRef.current?.srcObject;
    if (previewStream && previewStream !== ownedStream && "getTracks" in previewStream) {
      previewStream.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    processingRef.current = false;
    gateRef.current = createCameraScanGate();
    audioFeedback.close();
  }, [audioFeedback]);

  const stopCamera = useCallback(
    (nextStatus: CameraStatus = "idle") => {
      releaseCamera();
      if (mountedRef.current) {
        setScanFeedback(null);
        setStatus(nextStatus);
      }
    },
    [releaseCamera],
  );

  const startCamera = useCallback(async () => {
    if (
      openingRef.current ||
      busy ||
      disabled ||
      pause ||
      status === "starting" ||
      status === "active" ||
      status === "processing"
    ) {
      return;
    }

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setErrorMessage(
        "A câmera exige uma conexão segura (HTTPS) e um navegador compatível.",
      );
      setStatus("error");
      return;
    }

    openingRef.current = true;
    setOpeningPending(true);
    releaseCamera();
    // O contexto é criado neste clique para respeitar as políticas de áudio
    // automático dos navegadores móveis. Falhas de áudio não afetam a leitura.
    audioFeedback.prime();
    const token = startTokenRef.current;
    let attemptStream: MediaStream | null = null;
    let attemptControls: ScannerControls | null = null;
    let attemptTrackCleanup: (() => void) | null = null;

    function releaseAttemptResources() {
      attemptTrackCleanup?.();
      attemptTrackCleanup = null;
      safelyStopControls(attemptControls);
      attemptStream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current?.srcObject === attemptStream) {
        videoRef.current.srcObject = null;
      }
    }

    setErrorMessage("");
    setScanFeedback(null);
    setStatus("starting");

    try {
      const { BarcodeFormat, BrowserMultiFormatReader } = await import(
        "@zxing/browser"
      );
      const { DecodeHintType } = await import("@zxing/library");

      if (!mountedRef.current || token !== startTokenRef.current) {
        return;
      }

      const readerHints = new Map([
        [DecodeHintType.RETURN_CODABAR_START_END, true],
      ]);
      const reader = new BrowserMultiFormatReader(readerHints, {
        delayBetweenScanAttempts: 180,
        delayBetweenScanSuccess: 450,
        tryPlayVideoTimeout: 5000,
      });
      reader.possibleFormats = CAMERA_LOGISTICS_BARCODE_FORMAT_NAMES.map(
        (formatName) => BarcodeFormat[formatName],
      );

      const preview = videoRef.current;
      if (!preview) {
        throw new Error("Visualização da câmera indisponível.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      attemptStream = stream;

      if (
        !mountedRef.current ||
        token !== startTokenRef.current ||
        document.hidden
      ) {
        releaseAttemptResources();
        if (mountedRef.current && token === startTokenRef.current) {
          setStatus("paused");
        }
        return;
      }

      const videoTracks = stream.getVideoTracks();
      const handleTrackEnded = () => {
        if (!mountedRef.current || token !== startTokenRef.current) {
          return;
        }
        releaseCamera();
        setErrorMessage(
          "A câmera foi interrompida pelo aparelho. Toque em Retomar câmera.",
        );
        setStatus("error");
      };
      videoTracks.forEach((track) =>
        track.addEventListener("ended", handleTrackEnded),
      );
      attemptTrackCleanup = () =>
        videoTracks.forEach((track) =>
          track.removeEventListener("ended", handleTrackEnded),
        );
      trackCleanupRef.current = attemptTrackCleanup;
      ownedStreamRef.current = stream;

      const controls = await reader.decodeFromStream(
        stream,
        preview,
        (result, error) => {
          if (!mountedRef.current || token !== startTokenRef.current) {
            return;
          }

          if (
            !result &&
            error &&
            !isRecoverableCameraReaderError(error)
          ) {
            releaseCamera();
            setErrorMessage(
              "A leitura da câmera foi interrompida. Toque em Retomar câmera.",
            );
            setStatus("error");
            return;
          }

          if (processingRef.current || busyRef.current) {
            return;
          }

          if (!result) {
            gateRef.current = registerCameraMiss(
              gateRef.current,
              performance.now(),
            );
            return;
          }

          const detection = registerCameraDetection(
            gateRef.current,
            result.getText(),
          );
          gateRef.current = detection.gate;

          if (!detection.acceptedCode) {
            return;
          }

          processingRef.current = true;
          setScanFeedback(null);
          setStatus("processing");

          void onDetectedRef
            .current(detection.acceptedCode)
            .then((outcome) => {
              if (
                !mountedRef.current ||
                token !== startTokenRef.current
              ) {
                return;
              }

              setScanFeedback(outcome);
              audioFeedback.play(outcome.tone);
              safelyVibrate(
                outcome.tone === "success"
                  ? 70
                  : outcome.tone === "warning"
                    ? [70, 50, 70]
                    : [140, 70, 140],
              );
            })
            .catch(() => {
              if (
                mountedRef.current &&
                token === startTokenRef.current
              ) {
                setScanFeedback({
                  tone: "danger",
                  message: "Não foi possível processar este código.",
                  accepted: false,
                });
                audioFeedback.play("danger");
                safelyVibrate([140, 70, 140]);
              }
            })
            .finally(() => {
              if (token !== startTokenRef.current) {
                return;
              }

              processingRef.current = false;
              if (mountedRef.current && controlsRef.current) {
                setStatus("active");
              }
            });
        },
      );
      attemptControls = controls;

      if (!mountedRef.current || token !== startTokenRef.current) {
        releaseAttemptResources();
        return;
      }
      controlsRef.current = controls;

      setStatus(processingRef.current ? "processing" : "active");
    } catch (error) {
      if (!mountedRef.current || token !== startTokenRef.current) {
        releaseAttemptResources();
        return;
      }
      releaseCamera();
      setErrorMessage(getCameraErrorMessage(error));
      setStatus("error");
    } finally {
      openingRef.current = false;
      if (mountedRef.current) {
        setOpeningPending(false);
      }
    }
  }, [audioFeedback, busy, disabled, pause, releaseCamera, status]);

  useEffect(() => {
    if (
      (disabled || pause) &&
      (controlsRef.current ||
        status === "starting" ||
        status === "processing")
    ) {
      stopCamera(pause ? "paused" : "idle");
    }
  }, [disabled, pause, status, stopCamera]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (
        document.hidden &&
        (controlsRef.current ||
          status === "processing")
      ) {
        stopCamera("paused");
      }
    }

    function handlePageHide() {
      stopCamera("paused");
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [status, stopCamera]);

  useEffect(() => {
    const desktopViewport = window.matchMedia("(min-width: 1280px)");

    function handleDesktopViewport(event: MediaQueryListEvent) {
      if (
        event.matches &&
        (controlsRef.current ||
          status === "starting" ||
          status === "processing")
      ) {
        stopCamera("idle");
      }
    }

    desktopViewport.addEventListener("change", handleDesktopViewport);
    return () =>
      desktopViewport.removeEventListener("change", handleDesktopViewport);
  }, [status, stopCamera]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      releaseCamera();
    };
  }, [releaseCamera]);

  const cameraRunning = status === "active" || status === "processing";
  const actionableScanFeedback =
    scanFeedback && (scanFeedback.tone !== "success" || !scanFeedback.accepted)
      ? scanFeedback
      : null;
  const statusText =
    status === "starting"
      ? "Abrindo câmera..."
      : openingPending
        ? "Encerrando a abertura anterior da câmera..."
        : status === "processing" || (cameraRunning && busy)
        ? "Salvando pacote..."
        : status === "error"
          ? errorMessage
          : actionableScanFeedback
            ? actionableScanFeedback.message
            : status === "active"
              ? null
              : status === "paused"
                ? "Câmera pausada. Toque em Retomar para continuar."
                : disabled
                  ? disabledMessage
                  : "Ative a câmera traseira para começar.";
  const screenReaderStatus =
    statusText ??
    (scanFeedback?.accepted && scanFeedback.tone === "success"
      ? "Pacote adicionado à lista."
      : cameraRunning
        ? "Câmera ativa."
        : "");
  const inactiveOverlayMessage =
    status === "starting"
      ? "Abrindo câmera..."
      : errorMessage ||
        (status === "paused"
          ? "A leitura foi pausada. Retome quando estiver pronto."
          : disabled
            ? disabledMessage
            : null);

  return (
    <section
      className="mb-3 grid gap-2 rounded-2xl border border-teal-200 bg-teal-50/70 p-2.5 xl:hidden"
      aria-labelledby="mobile-camera-title"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="mobile-camera-title" className="text-sm font-bold text-slate-950">
          Câmera de bipagem
        </h2>
        <span
          className={`size-2.5 shrink-0 rounded-full ${
            cameraRunning ? "animate-pulse bg-emerald-500" : "bg-slate-300"
          }`}
          aria-hidden="true"
        />
        <p className="sr-only" role="status" aria-live="polite">
          {screenReaderStatus}
        </p>
      </div>

      <div className="mobile-camera-preview relative h-[clamp(7.5rem,20dvh,10.5rem)] w-full overflow-hidden rounded-xl bg-slate-950">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="Visualização da câmera para leitura do código"
          className="h-full w-full object-cover"
        />
        {!cameraRunning ? (
          <div className="absolute inset-0 grid place-items-center bg-slate-950 px-5 py-3 text-center">
            <div className="grid justify-items-center gap-2">
              {inactiveOverlayMessage ? (
                <p className="text-sm leading-5 text-slate-300">
                  {inactiveOverlayMessage}
                </p>
              ) : null}
              <button
                type="button"
                onClick={startCamera}
                disabled={
                  busy ||
                  disabled ||
                  pause ||
                  openingPending ||
                  status === "starting"
                }
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-600 px-4 text-sm font-bold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-600"
              >
                {openingPending || status === "starting"
                  ? "Aguarde..."
                  : busy
                    ? "Salvando..."
                    : status === "paused" || status === "error"
                      ? "Retomar câmera"
                      : "Ativar câmera"}
              </button>
            </div>
          </div>
        ) : null}
        {cameraRunning ? (
          <button
            type="button"
            onClick={() => stopCamera("idle")}
            aria-label="Parar câmera"
            title="Parar câmera"
            className="absolute right-2 top-2 z-10 inline-flex size-11 items-center justify-center rounded-full border border-white/30 bg-slate-950/75 text-white backdrop-blur transition hover:bg-slate-950 focus:outline-none focus:ring-4 focus:ring-white/40"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-5"
            >
              <rect
                x="7"
                y="7"
                width="10"
                height="10"
                rx="1.5"
                fill="currentColor"
              />
            </svg>
          </button>
        ) : null}
        {cameraRunning || status === "starting" ? (
          <div
            className="pointer-events-none absolute left-[8%] right-[8%] top-1/2 h-20 -translate-y-1/2 rounded-xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(2,6,23,0.24)]"
            aria-hidden="true"
          >
            <span className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.9)]" />
          </div>
        ) : null}
        {cameraRunning && statusText ? (
          <div className="absolute inset-x-2 bottom-2 z-10 rounded-lg bg-slate-950/80 px-2.5 py-1.5 text-left text-white backdrop-blur">
            <p
              className={`truncate text-xs font-bold ${
                actionableScanFeedback?.tone === "danger"
                  ? "text-rose-200"
                  : actionableScanFeedback?.tone === "warning"
                    ? "text-amber-200"
                    : "text-white"
              }`}
            >
              {statusText}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
