"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

type InstallResult = {
  tone: "success" | "neutral";
  message: string;
};

type PwaInstallContextValue = {
  available: boolean;
  installed: boolean;
  ready: boolean;
  requestInstall: () => Promise<InstallResult>;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

function isRunningStandalone() {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function isAppleMobileDevice() {
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ready, setReady] = useState(false);
  const [appleMobile, setAppleMobile] = useState(false);
  const [manualInstallAvailable, setManualInstallAvailable] = useState(false);

  useEffect(() => {
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const updateStandaloneState = () => {
      setInstalled(isRunningStandalone());
      setReady(true);
    };
    const handleBeforeInstallPrompt = (event: Event) => {
      if (pathname === "/demonstracao-bipagem") return;

      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setDeferredPrompt(installEvent);
    };
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setInstalled(true);
    };

    const initializationTimer = window.setTimeout(() => {
      const isAppleMobile = isAppleMobileDevice();
      setAppleMobile(isAppleMobile);
      setManualInstallAvailable(
        isAppleMobile || /Android/i.test(navigator.userAgent),
      );
      updateStandaloneState();
    }, 0);
    standaloneQuery.addEventListener("change", updateStandaloneState);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.clearTimeout(initializationTimer);
      standaloneQuery.removeEventListener("change", updateStandaloneState);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [pathname]);

  const requestInstall = useCallback(async (): Promise<InstallResult> => {
    if (deferredPrompt) {
      const activePrompt = deferredPrompt;
      setDeferredPrompt(null);
      await activePrompt.prompt();
      const choice = await activePrompt.userChoice;

      if (choice.outcome === "accepted") {
        setInstalled(true);
        return {
          tone: "success",
          message: "Aplicativo instalado na tela inicial.",
        };
      }

      return {
        tone: "neutral",
        message: "Instalação cancelada. Você pode tentar novamente pelo menu do navegador.",
      };
    }

    if (appleMobile) {
      return {
        tone: "neutral",
        message:
          "No iPhone ou iPad, abra no Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.",
      };
    }

    return {
      tone: "neutral",
      message:
        "Abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.",
    };
  }, [appleMobile, deferredPrompt]);

  const value = useMemo(
    () => ({
      available: Boolean(deferredPrompt) || manualInstallAvailable,
      installed,
      ready,
      requestInstall,
    }),
    [deferredPrompt, installed, manualInstallAvailable, ready, requestInstall],
  );

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
    </PwaInstallContext.Provider>
  );
}

function usePwaInstall() {
  const context = useContext(PwaInstallContext);

  if (!context) {
    throw new Error("usePwaInstall deve ser usado dentro de PwaInstallProvider.");
  }

  return context;
}

export function InstallAppButton({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const { available, installed, ready, requestInstall } = usePwaInstall();
  const [result, setResult] = useState<InstallResult | null>(null);
  const [requesting, setRequesting] = useState(false);

  if (!ready || installed || !available) return null;

  async function handleInstall() {
    setRequesting(true);
    setResult(null);

    try {
      setResult(await requestInstall());
    } catch {
      setResult({
        tone: "neutral",
        message:
          "Não foi possível abrir a instalação. Use “Instalar aplicativo” no menu do navegador.",
      });
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleInstall}
        disabled={requesting}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border font-semibold shadow-sm transition focus-visible:ring-4 focus-visible:ring-teal-100 disabled:cursor-wait disabled:opacity-70 ${
          compact
            ? "min-h-10 border-teal-200 bg-teal-50 px-3 text-xs text-teal-800 hover:border-teal-300 hover:bg-teal-100"
            : "min-h-11 border-slate-200 bg-white px-3.5 text-sm text-slate-700 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[1.125rem] shrink-0"
          aria-hidden="true"
        >
          <path d="M12 3v11" />
          <path d="m8 10 4 4 4-4" />
          <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
        </svg>
        {requesting ? "Abrindo instalação..." : "Instalar aplicativo"}
      </button>

      {!compact ? (
        <p className="mt-1.5 text-center text-[0.7rem] font-medium leading-4 text-slate-500">
          Use o sistema como aplicativo no celular ou computador.
        </p>
      ) : null}

      {result ? (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-xs font-semibold leading-5 ${
            result.tone === "success"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-slate-100 text-slate-700"
          }`}
          role="status"
          aria-live="polite"
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
