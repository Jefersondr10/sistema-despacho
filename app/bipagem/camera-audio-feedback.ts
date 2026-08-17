export type CameraAudioTone = "success" | "warning" | "danger";

export type CameraAudioNote = Readonly<{
  delaySeconds: number;
  durationSeconds: number;
  frequencyHz: number;
  oscillatorType: OscillatorType;
  volume: number;
}>;

const CAMERA_AUDIO_CUES: Readonly<
  Record<CameraAudioTone, readonly CameraAudioNote[]>
> = {
  success: [
    {
      delaySeconds: 0,
      durationSeconds: 0.075,
      frequencyHz: 2_100,
      oscillatorType: "sine",
      volume: 1,
    },
  ],
  warning: [
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
  ],
  danger: [
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
  ],
};

export function getCameraAudioCue(tone: CameraAudioTone) {
  return CAMERA_AUDIO_CUES[tone];
}

type AudioContextFactory = () => AudioContext | null;

function createBrowserAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  return AudioContextConstructor ? new AudioContextConstructor() : null;
}

export type CameraAudioFeedbackController = {
  close: () => void;
  play: (tone: CameraAudioTone) => void;
  prime: () => void;
};

export function createCameraAudioFeedbackController(
  createContext: AudioContextFactory = createBrowserAudioContext,
): CameraAudioFeedbackController {
  let context: AudioContext | null = null;

  function prime() {
    try {
      if (!context || context.state === "closed") {
        context = createContext();
      }

      if (context && context.state !== "running" && context.state !== "closed") {
        void context.resume().catch(() => undefined);
      }
    } catch {
      context = null;
    }
  }

  function schedule(tone: CameraAudioTone, activeContext: AudioContext) {
    if (context !== activeContext || activeContext.state !== "running") {
      return;
    }

    const baseTime = activeContext.currentTime + 0.005;

    for (const note of getCameraAudioCue(tone)) {
      const oscillator = activeContext.createOscillator();
      const gain = activeContext.createGain();
      const startTime = baseTime + note.delaySeconds;
      const endTime = startTime + note.durationSeconds;

      oscillator.type = note.oscillatorType;
      oscillator.frequency.setValueAtTime(note.frequencyHz, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(
        note.volume,
        startTime + Math.min(0.008, note.durationSeconds / 3),
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
      oscillator.connect(gain);
      gain.connect(activeContext.destination);
      oscillator.addEventListener(
        "ended",
        () => {
          oscillator.disconnect();
          gain.disconnect();
        },
        { once: true },
      );
      oscillator.start(startTime);
      oscillator.stop(endTime + 0.01);
    }
  }

  function play(tone: CameraAudioTone) {
    try {
      const activeContext = context;
      if (!activeContext || activeContext.state === "closed") {
        return;
      }

      if (activeContext.state !== "running") {
        void activeContext
          .resume()
          .then(() => schedule(tone, activeContext))
          .catch(() => undefined);
        return;
      }

      schedule(tone, activeContext);
    } catch {
      // O pacote ja foi processado; falhas de som nunca mudam esse resultado.
    }
  }

  function close() {
    const activeContext = context;
    context = null;

    if (activeContext && activeContext.state !== "closed") {
      void activeContext.close().catch(() => undefined);
    }
  }

  return { close, play, prime };
}
