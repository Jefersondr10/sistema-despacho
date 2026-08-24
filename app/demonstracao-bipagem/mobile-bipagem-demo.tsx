"use client";

import { type FormEvent, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  MobileCameraScanner,
  type CameraScanOutcome,
} from "@/app/bipagem/mobile-camera-scanner";
import { parseTrackingCode } from "@/app/bipagem/tracking-code-policy";
import { useAccessibleFullscreenDialog } from "@/app/bipagem/use-accessible-fullscreen-dialog";

type DemoPackage = {
  id: string;
  code: string;
  scannedAt: string;
};

type DemoNotice = {
  tone: CameraScanOutcome["tone"] | "info";
  message: string;
};

type DemoStep = "setup" | "scanning" | "finished";
type DemoOperation = "coleta" | "postagem";
type PendingAction = "clear" | "exit" | null;
type DemoPackagesFullscreenMode = "browse" | "manual-remove";

type DemoSetup = {
  store: string;
  marketplace: string;
  operation: DemoOperation | "";
  melhorEnvio: boolean;
  carrier: string;
};

const DEMO_STORES = ["Loja Demonstração", "Loja Centro", "Loja Filial"];
const DEMO_MARKETPLACES = ["Mercado Livre", "Shopee", "Amazon"];
const DEMO_CARRIERS = ["Correios", "Jadlog", "Loggi"];

const INITIAL_SETUP: DemoSetup = {
  store: "",
  marketplace: "",
  operation: "",
  melhorEnvio: false,
  carrier: "",
};

function countCodes(packages: DemoPackage[]) {
  const counts = new Map<string, number>();

  packages.forEach((item) => {
    counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
  });

  return counts;
}

function getDuplicateExcess(packages: DemoPackage[]) {
  let excess = 0;
  countCodes(packages).forEach((count) => {
    excess += Math.max(0, count - 1);
  });
  return excess;
}

function getSetupError(setup: DemoSetup) {
  if (!setup.store) return "Selecione a loja para continuar.";
  if (!setup.marketplace) return "Selecione o marketplace para continuar.";
  if (!setup.operation) return "Escolha Coleta ou Postagem para continuar.";
  if (setup.melhorEnvio && !setup.carrier) {
    return "Selecione a transportadora do Melhor Envio para continuar.";
  }
  return "";
}

function operationLabel(operation: DemoOperation | "") {
  return operation === "postagem" ? "Postagem" : "Coleta";
}

function normalizeDemoTrackingCode(code: string) {
  return code.replace(/\s+/g, "").toUpperCase();
}

export function MobileBipagemDemo() {
  const [step, setStep] = useState<DemoStep>("setup");
  const [setup, setSetup] = useState<DemoSetup>(INITIAL_SETUP);
  const [setupError, setSetupError] = useState("");
  const [packages, setPackages] = useState<DemoPackage[]>([]);
  const [busy, setBusy] = useState(false);
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
  const [packagesFullscreenOpen, setPackagesFullscreenOpen] = useState(false);
  const [packagesFullscreenMode, setPackagesFullscreenMode] =
    useState<DemoPackagesFullscreenMode>("browse");
  const [manualRemovalQuery, setManualRemovalQuery] = useState("");
  const [manualRemovalStatus, setManualRemovalStatus] = useState("");
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [finishedTotal, setFinishedTotal] = useState(0);
  const [scannerCycle, setScannerCycle] = useState(0);
  const [notice, setNotice] = useState<DemoNotice>({
    tone: "info",
    message: "Ative a câmera ou digite um código para começar.",
  });
  const packagesRef = useRef<DemoPackage[]>([]);
  const processingRef = useRef(false);
  const operationTokenRef = useRef(0);
  const sequenceRef = useRef(0);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const duplicateManagerRef = useRef<HTMLElement>(null);
  const duplicateManagerInitialFocusRef = useRef<HTMLButtonElement>(null);
  const packagesFullscreenRef = useRef<HTMLElement>(null);
  const packagesFullscreenInitialFocusRef = useRef<HTMLButtonElement>(null);
  const manualRemovalInputRef = useRef<HTMLInputElement>(null);
  const packagesFullscreenTriggerRef = useRef<HTMLButtonElement>(null);
  const manualOptionRef = useRef<HTMLButtonElement>(null);
  const optionsTriggerRef = useRef<HTMLButtonElement>(null);
  const optionsDialogRef = useRef<HTMLElement>(null);
  const pendingActionDialogRef = useRef<HTMLElement>(null);
  const pendingActionInitialFocusRef = useRef<HTMLButtonElement>(null);

  const codeCounts = useMemo(() => countCodes(packages), [packages]);
  const duplicateExcess = useMemo(
    () => getDuplicateExcess(packages),
    [packages],
  );
  const visiblePackages = showOnlyDuplicates
    ? packages.filter((item) => (codeCounts.get(item.code) ?? 0) > 1)
    : packages;
  const fullscreenPackages = useMemo(() => {
    if (packagesFullscreenMode !== "manual-remove") {
      return packages;
    }

    const normalizedQuery = normalizeDemoTrackingCode(manualRemovalQuery);
    if (!normalizedQuery) {
      return [];
    }

    return packages.filter((item) =>
      normalizeDemoTrackingCode(item.code).includes(normalizedQuery),
    );
  }, [manualRemovalQuery, packages, packagesFullscreenMode]);
  const manualRemovalHasQuery = Boolean(
    normalizeDemoTrackingCode(manualRemovalQuery),
  );
  const manualEntryFeedback =
    manualEntryOpen &&
    (notice.tone === "danger" || notice.tone === "warning")
      ? notice
      : null;

  useAccessibleFullscreenDialog({
    open: showOnlyDuplicates,
    dialogRef: duplicateManagerRef,
    initialFocusRef: duplicateManagerInitialFocusRef,
    onClose: returnToScanning,
  });

  useAccessibleFullscreenDialog({
    open: packagesFullscreenOpen,
    dialogRef: packagesFullscreenRef,
    initialFocusRef:
      packagesFullscreenMode === "manual-remove"
        ? manualRemovalInputRef
        : packagesFullscreenInitialFocusRef,
    onClose: closePackagesFullscreen,
  });

  useAccessibleFullscreenDialog({
    open: Boolean(pendingAction),
    dialogRef: pendingActionDialogRef,
    initialFocusRef: pendingActionInitialFocusRef,
    onClose: closePendingAction,
  });

  useAccessibleFullscreenDialog({
    open: optionsOpen,
    dialogRef: optionsDialogRef,
    initialFocusRef: manualOptionRef,
    onClose: closeDemoOptions,
  });

  function updateSetup<Key extends keyof DemoSetup>(
    key: Key,
    value: DemoSetup[Key],
  ) {
    setSetup((current) => ({ ...current, [key]: value }));
    setSetupError("");
  }

  function replacePackages(nextPackages: DemoPackage[]) {
    packagesRef.current = nextPackages;
    setPackages(nextPackages);
  }

  function resetReadings() {
    operationTokenRef.current += 1;
    processingRef.current = false;
    setBusy(false);
    replacePackages([]);
    setShowOnlyDuplicates(false);
    setPackagesFullscreenOpen(false);
    setPackagesFullscreenMode("browse");
    setManualRemovalQuery("");
    setManualRemovalStatus("");
    setManualEntryOpen(false);
    setOptionsOpen(false);
    setPendingAction(null);
    setScannerCycle((current) => current + 1);
  }

  function startScanning(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = getSetupError(setup);

    if (error) {
      setSetupError(error);
      return;
    }

    resetReadings();
    setFinishedTotal(0);
    setStep("scanning");
    setNotice({
      tone: "info",
      message: "Lote de teste iniciado. Ative a câmera para bipar.",
    });
  }

  async function addLocalPackage(
    rawCode: string,
  ): Promise<CameraScanOutcome> {
    const parsedCode = parseTrackingCode(rawCode, {
      carrier: setup.melhorEnvio ? setup.carrier : null,
    });

    if (!parsedCode.accepted) {
      const outcome: CameraScanOutcome = {
        tone: parsedCode.reason === "empty" ? "warning" : "danger",
        message: parsedCode.message,
        accepted: false,
      };
      setNotice(outcome);
      return outcome;
    }

    const code = parsedCode.code;

    if (processingRef.current) {
      return {
        tone: "warning",
        message: "Aguarde a leitura anterior terminar.",
        accepted: false,
      };
    }

    processingRef.current = true;
    setBusy(true);
    const operationToken = operationTokenRef.current;

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 180));

      if (operationToken !== operationTokenRef.current) {
        return {
          tone: "warning",
          message: "Leitura interrompida pela limpeza da demonstração.",
          accepted: false,
        };
      }

      const duplicated = packagesRef.current.some(
        (item) => item.code === code,
      );
      sequenceRef.current += 1;
      const nextPackage: DemoPackage = {
        id: `demo-${Date.now()}-${sequenceRef.current}`,
        code,
        scannedAt: new Intl.DateTimeFormat("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      };

      replacePackages([nextPackage, ...packagesRef.current]);
      window.requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      });

      const outcome: CameraScanOutcome = {
        tone: duplicated ? "warning" : "success",
        message: duplicated
          ? `Duplicidade criada para ${code}. Corrija antes de finalizar.`
          : `Código ${code} adicionado somente à demonstração.`,
        accepted: true,
        code,
      };
      setNotice(outcome);
      return outcome;
    } finally {
      if (operationToken === operationTokenRef.current) {
        processingRef.current = false;
        setBusy(false);
      }
    }
  }

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const outcome = await addLocalPackage(manualInputRef.current?.value ?? "");

    if (outcome.accepted && manualInputRef.current) {
      manualInputRef.current.value = "";
      setManualEntryOpen(false);
    }
  }

  function openManualEntry() {
    setOptionsOpen(false);
    setShowOnlyDuplicates(false);
    setPackagesFullscreenOpen(false);
    setNotice({ tone: "info", message: "" });
    flushSync(() => setManualEntryOpen(true));
    manualInputRef.current?.focus({ preventScroll: true });
  }

  function showDuplicates() {
    setOptionsOpen(false);
    setManualEntryOpen(false);
    setPackagesFullscreenOpen(false);
    setShowOnlyDuplicates(true);
    window.requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function returnToScanning() {
    setShowOnlyDuplicates(false);
    setNotice({
      tone: "info",
      message: "Bipagem liberada. Toque em Retomar câmera para continuar.",
    });
  }

  function openPackagesFullscreen() {
    setOptionsOpen(false);
    setManualEntryOpen(false);
    setShowOnlyDuplicates(false);
    setPackagesFullscreenMode("browse");
    setManualRemovalQuery("");
    setManualRemovalStatus("");
    setPackagesFullscreenOpen(true);
  }

  function openManualRemoval() {
    if (!packagesRef.current.length || processingRef.current) {
      return;
    }

    setOptionsOpen(false);
    setManualEntryOpen(false);
    setShowOnlyDuplicates(false);
    setPackagesFullscreenMode("manual-remove");
    setManualRemovalQuery("");
    setManualRemovalStatus("");
    setPackagesFullscreenOpen(true);
  }

  function closePackagesFullscreen() {
    setPackagesFullscreenOpen(false);
    setPackagesFullscreenMode("browse");
    setManualRemovalQuery("");
    setManualRemovalStatus("");
    setNotice({
      tone: "info",
      message: "Lista fechada. Toque em Retomar câmera para continuar.",
    });
    window.requestAnimationFrame(() =>
      optionsTriggerRef.current?.focus({ preventScroll: true }),
    );
  }

  function closeDemoOptions() {
    setOptionsOpen(false);
  }

  function closePendingAction() {
    setPendingAction(null);
    window.requestAnimationFrame(() =>
      optionsTriggerRef.current?.focus({ preventScroll: true }),
    );
  }

  function removePackage(id: string) {
    const removedItem = packagesRef.current.find((item) => item.id === id);
    const removedDuplicate = removedItem
      ? (countCodes(packagesRef.current).get(removedItem.code) ?? 0) > 1
      : false;
    const nextPackages = packagesRef.current.filter((item) => item.id !== id);
    replacePackages(nextPackages);

    setNotice({
      tone: "success",
      message: removedDuplicate
        ? "Repetição removida. Nenhum dado foi enviado ao sistema."
        : "Pacote removido somente da demonstração.",
    });

    if (packagesFullscreenMode === "manual-remove") {
      setManualRemovalQuery("");
      setManualRemovalStatus(
        `Código ${removedItem?.code ?? "selecionado"} removido do teste.`,
      );
      window.requestAnimationFrame(() =>
        manualRemovalInputRef.current?.focus({ preventScroll: true }),
      );
    }
  }

  function finishDemo() {
    if (processingRef.current) return;

    if (duplicateExcess > 0) {
      showDuplicates();
      setNotice({
        tone: "warning",
        message: "Remova as repetições antes de finalizar a demonstração.",
      });
      return;
    }

    const total = packagesRef.current.length;
    if (!total) return;

    setFinishedTotal(total);
    resetReadings();
    setStep("finished");
  }

  function confirmPendingAction() {
    if (pendingAction === "clear") {
      resetReadings();
      setNotice({
        tone: "info",
        message: "Leituras apagadas. Nenhum dado foi salvo.",
      });
      return;
    }

    if (pendingAction === "exit") {
      resetReadings();
      setStep("setup");
      setNotice({
        tone: "info",
        message: "Bipagem encerrada sem salvar dados.",
      });
    }
  }

  function startAnotherDemo() {
    resetReadings();
    setFinishedTotal(0);
    setStep("setup");
  }

  const setupSummary = `${setup.store} · ${setup.marketplace} · ${operationLabel(setup.operation)}`;

  if (step === "setup") {
    return (
      <div className="min-h-dvh bg-slate-100 text-slate-950">
        <header className="sticky top-0 z-30 border-b border-amber-200 bg-amber-50/95 px-4 py-3 shadow-sm backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-amber-700">
                Demonstração segura
              </p>
              <h1 className="truncate text-base font-black">Bipagem móvel</h1>
            </div>
            <span className="shrink-0 rounded-full bg-amber-200 px-3 py-1.5 text-xs font-black text-amber-900">
              NÃO SALVA
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-xl px-4 py-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <div className="mb-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">
              Etapa 1 de 2
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.03em]">
              Configure o lote de teste
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Faça as mesmas escolhas exigidas pelo sistema. Depois, a tela fica
              focada apenas na bipagem.
            </p>
          </div>

          <form
            onSubmit={startScanning}
            noValidate
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-black text-slate-800">
                Loja <span className="sr-only">obrigatória</span>
                <select
                  value={setup.store}
                  onChange={(event) => updateSetup("store", event.target.value)}
                  required
                  className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                >
                  <option value="">Selecione uma loja</option>
                  {DEMO_STORES.map((store) => (
                    <option key={store} value={store}>{store}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-black text-slate-800">
                Marketplace <span className="sr-only">obrigatório</span>
                <select
                  value={setup.marketplace}
                  onChange={(event) =>
                    updateSetup("marketplace", event.target.value)
                  }
                  required
                  className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                >
                  <option value="">Selecione um marketplace</option>
                  {DEMO_MARKETPLACES.map((marketplace) => (
                    <option key={marketplace} value={marketplace}>
                      {marketplace}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset className="mt-5">
              <legend className="mb-2 text-sm font-black text-slate-800">
                Tipo de operação <span className="sr-only">obrigatório</span>
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {(["coleta", "postagem"] as DemoOperation[]).map((operation) => (
                  <button
                    key={operation}
                    type="button"
                    aria-pressed={setup.operation === operation}
                    onClick={() => updateSetup("operation", operation)}
                    className={`min-h-12 rounded-xl border px-3 text-sm font-black transition ${
                      setup.operation === operation
                        ? "border-teal-600 bg-teal-50 text-teal-900 ring-2 ring-teal-100"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {operationLabel(operation)}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-5">
              <p className="mb-2 text-sm font-black text-slate-800">
                Usa Melhor Envio?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[false, true].map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    aria-pressed={setup.melhorEnvio === value}
                    onClick={() => {
                      updateSetup("melhorEnvio", value);
                      if (!value) updateSetup("carrier", "");
                    }}
                    className={`min-h-12 rounded-xl border px-3 text-sm font-black transition ${
                      setup.melhorEnvio === value
                        ? "border-teal-600 bg-teal-50 text-teal-900 ring-2 ring-teal-100"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {value ? "Sim" : "Não"}
                  </button>
                ))}
              </div>
            </div>

            {setup.melhorEnvio ? (
              <label className="mt-5 grid gap-2 text-sm font-black text-slate-800">
                Transportadora <span className="sr-only">obrigatória</span>
                <select
                  value={setup.carrier}
                  onChange={(event) => updateSetup("carrier", event.target.value)}
                  required
                  className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                >
                  <option value="">Selecione a transportadora</option>
                  {DEMO_CARRIERS.map((carrier) => (
                    <option key={carrier} value={carrier}>{carrier}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {setupError ? (
              <p
                className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-800"
                role="alert"
              >
                {setupError}
              </p>
            ) : null}

            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-900">
              Este teste não usa login nem envia informações ao sistema. Tudo
              desaparece ao sair ou atualizar a página.
            </div>

            <button
              type="submit"
              className="mt-5 inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-teal-700 px-5 text-base font-black text-white shadow-sm hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-200"
            >
              Iniciar bipagem
            </button>
          </form>
        </main>
      </div>
    );
  }

  if (step === "finished") {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-100 px-4 py-8 text-slate-950">
        <main className="w-full max-w-md rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-lg">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-2xl" aria-hidden="true">
            ✓
          </span>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
            Demonstração finalizada
          </p>
          <h1 className="mt-2 text-2xl font-black">{finishedTotal} pacote{finishedTotal === 1 ? "" : "s"} bipado{finishedTotal === 1 ? "" : "s"}</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
            Nenhum dado foi salvo no sistema. Este foi apenas um teste local no
            seu aparelho.
          </p>
          <button
            type="button"
            onClick={startAnotherDemo}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-teal-700 px-5 text-sm font-black text-white"
          >
            Fazer outra bipagem
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex h-dvh flex-col overflow-hidden bg-slate-100 text-slate-950">
      <header className="z-30 shrink-0 border-b border-slate-200 bg-white/95 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-teal-700">
                Lote de demonstração
              </p>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-black text-amber-800">
                NÃO SALVA
              </span>
            </div>
            <p className="mt-1 truncate text-xs font-bold text-slate-600">
              {setupSummary}
              {setup.melhorEnvio
                ? ` · Melhor Envio · ${setup.carrier}`
                : " · Sem Melhor Envio"}
            </p>
          </div>
          <span className="shrink-0 rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white" aria-label={`${packages.length} pacotes bipados`}>
            {packages.length}
          </span>
        </div>
      </header>

      <main className="mobile-bipagem-main mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-2 overflow-hidden px-2 pt-2 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        {manualEntryOpen ? (
          <form
            onSubmit={handleManualSubmit}
            className="mobile-manual-entry shrink-0 rounded-xl border border-slate-200 bg-white p-2 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <label className="sr-only" htmlFor="demo-code">Código do pacote</label>
              <input
                ref={manualInputRef}
                id="demo-code"
                aria-invalid={manualEntryFeedback ? true : undefined}
                aria-describedby={
                  manualEntryFeedback ? "demo-manual-feedback" : undefined
                }
                onChange={() => {
                  if (manualEntryFeedback) {
                    setNotice({ tone: "info", message: "" });
                  }
                }}
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="Digite o código do pacote"
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 font-mono text-sm font-bold uppercase outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              />
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-3 text-sm font-black text-white disabled:bg-slate-300"
              >
                Adicionar
              </button>
              <button
                type="button"
                onClick={() => setManualEntryOpen(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-black text-slate-600"
                aria-label="Fechar entrada manual"
              >
                Fechar
              </button>
            </div>
            {manualEntryFeedback ? (
              <p
                id="demo-manual-feedback"
                className={`mt-2 rounded-lg border px-3 py-2 text-xs font-bold ${
                  manualEntryFeedback.tone === "danger"
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
                role="alert"
              >
                {manualEntryFeedback.message}
              </p>
            ) : null}
          </form>
        ) : null}

        <div className="mobile-camera-shell shrink-0 [&>section]:!mb-0 [&>section]:!grid [&>section]:!gap-2 [&>section]:!rounded-xl [&>section]:!p-2">
          <MobileCameraScanner
            key={scannerCycle}
            busy={busy}
            disabled={false}
            disabledMessage=""
            pause={
              showOnlyDuplicates ||
              packagesFullscreenOpen ||
              manualEntryOpen ||
              optionsOpen ||
              Boolean(pendingAction)
            }
            onDetected={addLocalPackage}
          />
        </div>

        <section className="mobile-package-list flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="demo-package-list-title">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-3 py-2">
            <h2 id="demo-package-list-title" className="text-sm font-black">
              {showOnlyDuplicates ? "Duplicados" : "Pacotes bipados"} ({visiblePackages.length})
            </h2>
            {showOnlyDuplicates ? (
              <button type="button" onClick={returnToScanning} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700">
                Voltar a bipar
              </button>
            ) : duplicateExcess > 0 ? (
              <button type="button" onClick={showDuplicates} className="min-h-9 rounded-lg bg-amber-100 px-3 text-xs font-black text-amber-900">
                {duplicateExcess} duplicado{duplicateExcess === 1 ? "" : "s"}
              </button>
            ) : null}
          </div>

          <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-2">
            {visiblePackages.length ? (
              visiblePackages.map((item) => {
                const duplicated = (codeCounts.get(item.code) ?? 0) > 1;
                const isLatest = item.id === packages[0]?.id;
                const originalIndex = packages.findIndex(
                  (candidate) => candidate.id === item.id,
                );
                return (
                  <article
                    key={item.id}
                    className={`rounded-xl border p-3 ${
                      duplicated
                        ? "border-amber-300 bg-amber-50"
                        : isLatest
                          ? "border-teal-400 bg-teal-50"
                          : "border-slate-200 bg-slate-50"
                    } ${isLatest ? "ring-2 ring-teal-200" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-slate-400">Pacote {packages.length - originalIndex}</p>
                        <p className="mt-1 break-all font-mono text-sm font-black text-slate-950">{item.code}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">Bipado às {item.scannedAt}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {isLatest ? (
                          <span className="rounded-full bg-teal-700 px-2 py-1 text-[0.6rem] font-black text-white">
                            MAIS RECENTE
                          </span>
                        ) : null}
                        {duplicated ? <span className="rounded-full bg-amber-200 px-2 py-1 text-[0.6rem] font-black text-amber-900">DUPLICADO</span> : null}
                      </div>
                    </div>
                    <button type="button" onClick={() => removePackage(item.id)} className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
                      {duplicated ? "Remover repetição" : "Remover pacote"}
                    </button>
                  </article>
                );
              })
            ) : (
              <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 text-center text-sm font-semibold leading-5 text-slate-500">
                {showOnlyDuplicates ? "Nenhuma repetição pendente." : "Os códigos bipados aparecerão nesta lista."}
              </div>
            )}
          </div>
        </section>
      </main>

      {showOnlyDuplicates ? (
        <section
          ref={duplicateManagerRef}
          tabIndex={-1}
          className="fixed inset-0 z-[100] flex h-dvh flex-col overflow-hidden bg-slate-100 text-slate-950 xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-duplicate-manager-title"
        >
          <header className="shrink-0 border-b border-slate-200 bg-white px-3 pb-3 pt-[calc(0.5rem+env(safe-area-inset-top))] shadow-sm">
            <div className="mx-auto flex w-full max-w-xl items-center gap-3">
              <button
                ref={duplicateManagerInitialFocusRef}
                type="button"
                onClick={returnToScanning}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-black text-slate-700"
              >
                <span aria-hidden="true">←</span>
                <span className="ml-1">Voltar</span>
              </button>
              <div className="min-w-0 flex-1">
                <h2
                  id="demo-duplicate-manager-title"
                  className="truncate text-base font-black"
                >
                  Corrigir duplicados
                </h2>
                <p className="mt-0.5 text-xs font-bold text-rose-700">
                  {duplicateExcess} {duplicateExcess === 1 ? "repetição" : "repetições"} para remover
                </p>
              </div>
              <span
                className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl bg-rose-700 px-2 text-sm font-black text-white"
                aria-label={`${duplicateExcess} repetições pendentes`}
              >
                {duplicateExcess}
              </span>
            </div>
          </header>

          <div className="mx-auto min-h-0 w-full max-w-xl flex-1 overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]">
            {visiblePackages.length ? (
              <div className="space-y-3">
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-bold leading-5 text-rose-800">
                  Escolha uma ocorrência de cada código repetido para remover.
                </p>
                {visiblePackages.map((item) => {
                  const originalIndex = packages.findIndex(
                    (candidate) => candidate.id === item.id,
                  );

                  return (
                    <article
                      key={`duplicate-${item.id}`}
                      className="rounded-2xl border border-rose-300 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-400">
                            Pacote {packages.length - originalIndex}
                          </p>
                          <p
                            className="mt-2 break-all font-mono text-base font-black leading-6 text-slate-950"
                            title={item.code}
                          >
                            {item.code}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Bipado às {item.scannedAt}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-rose-100 px-2.5 py-1 text-[0.65rem] font-black text-rose-800">
                          DUPLICADO
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePackage(item.id)}
                        className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-rose-700 px-4 text-sm font-black text-white"
                        aria-label={`Remover repetição ${item.code}`}
                      >
                        Remover esta repetição
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-full place-items-center px-5 py-10 text-center">
                <div>
                  <span
                    className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-2xl font-black text-emerald-700"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <h3 className="mt-4 text-xl font-black">
                    Duplicados corrigidos
                  </h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    Não há mais repetições pendentes neste lote de teste.
                  </p>
                </div>
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2 shadow-[0_-14px_36px_-24px_rgba(15,23,42,0.55)]">
            <div className="mx-auto w-full max-w-xl pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={returnToScanning}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white"
              >
                {duplicateExcess > 0
                  ? "Voltar à bipagem"
                  : "Continuar bipagem"}
              </button>
            </div>
          </footer>
        </section>
      ) : null}

      {packagesFullscreenOpen ? (
        <section
          ref={packagesFullscreenRef}
          tabIndex={-1}
          className={`fixed inset-0 z-[110] flex h-dvh flex-col overflow-hidden bg-slate-100 text-slate-950 ${
            packagesFullscreenMode === "manual-remove"
              ? "mobile-manual-removal-dialog"
              : ""
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-packages-fullscreen-title"
        >
          <header className="shrink-0 border-b border-slate-200 bg-white px-3 pb-3 pt-[calc(0.5rem+env(safe-area-inset-top))] shadow-sm">
            <div className="mx-auto flex w-full max-w-xl items-center gap-3">
              <button
                ref={packagesFullscreenInitialFocusRef}
                type="button"
                onClick={closePackagesFullscreen}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-black text-slate-700"
              >
                <span aria-hidden="true">←</span>
                <span className="ml-1">Voltar</span>
              </button>
              <div className="min-w-0 flex-1">
                <h2
                  id="demo-packages-fullscreen-title"
                  className="truncate text-base font-black"
                >
                  {packagesFullscreenMode === "manual-remove"
                    ? "Remover código bipado"
                    : "Pacotes bipados"}
                </h2>
                <p className="mt-0.5 text-xs font-bold text-slate-600">
                  {packages.length} pacote{packages.length === 1 ? "" : "s"}
                  {duplicateExcess > 0
                    ? ` · ${duplicateExcess} duplicado${duplicateExcess === 1 ? "" : "s"}`
                    : " · sem duplicados"}
                </p>
              </div>
              <span
                className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl bg-slate-950 px-2 text-sm font-black text-white"
                aria-label={`${packages.length} pacotes bipados`}
              >
                {packages.length}
              </span>
            </div>
          </header>

          {packagesFullscreenMode === "manual-remove" ? (
            <div className="mobile-manual-removal-search shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-3">
              <div className="mx-auto grid w-full max-w-xl gap-2">
                <label
                  htmlFor="demo-manual-removal-query"
                  className="text-xs font-black text-amber-950"
                >
                  Código bipado
                </label>
                <input
                  ref={manualRemovalInputRef}
                  id="demo-manual-removal-query"
                  value={manualRemovalQuery}
                  onChange={(event) => {
                    setManualRemovalQuery(event.target.value);
                    setManualRemovalStatus("");
                  }}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="Digite ou bipe para localizar"
                  className="min-h-12 w-full rounded-xl border-2 border-amber-300 bg-white px-3 font-mono text-base font-black uppercase text-slate-950 outline-none transition placeholder:font-sans placeholder:text-sm placeholder:font-semibold placeholder:normal-case focus:border-amber-600 focus:ring-4 focus:ring-amber-100"
                />
                <div className="flex items-start justify-between gap-3 text-xs font-semibold leading-5 text-amber-950">
                  <p className="max-w-md">
                    Escolha uma leitura e toque em Remover do teste.
                  </p>
                  <span
                    className="shrink-0 rounded-full bg-white px-2.5 py-1 font-black"
                    role="status"
                    aria-live="polite"
                  >
                    {manualRemovalHasQuery
                      ? `${fullscreenPackages.length} encontrado${fullscreenPackages.length === 1 ? "" : "s"}`
                      : "Digite um código"}
                  </span>
                </div>
                {manualRemovalStatus ? (
                  <p
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800"
                    role="status"
                    aria-live="polite"
                  >
                    {manualRemovalStatus}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mobile-manual-removal-results mx-auto min-h-0 w-full max-w-xl flex-1 overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]">
            {fullscreenPackages.length ? (
              <div className="space-y-3">
                {packagesFullscreenMode === "browse" && duplicateExcess > 0 ? (
                  <button
                    type="button"
                    onClick={showDuplicates}
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-black text-white"
                  >
                    Corrigir {duplicateExcess} duplicado{duplicateExcess === 1 ? "" : "s"}
                  </button>
                ) : null}

                {fullscreenPackages.map((item) => {
                  const duplicated = (codeCounts.get(item.code) ?? 0) > 1;
                  const isLatest = item.id === packages[0]?.id;
                  const originalIndex = packages.findIndex(
                    (candidate) => candidate.id === item.id,
                  );

                  return (
                    <article
                      key={`fullscreen-${item.id}`}
                      className={`rounded-2xl border bg-white p-4 shadow-sm ${
                        duplicated
                          ? "border-amber-300"
                          : isLatest
                            ? "border-teal-400 ring-2 ring-teal-100"
                            : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-400">
                            Pacote {packages.length - originalIndex}
                          </p>
                          <p
                            className="mt-2 break-all font-mono text-base font-black leading-6 text-slate-950"
                            title={item.code}
                          >
                            {item.code}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Bipado às {item.scannedAt}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {isLatest ? (
                            <span className="rounded-full bg-teal-700 px-2.5 py-1 text-[0.65rem] font-black text-white">
                              MAIS RECENTE
                            </span>
                          ) : null}
                          {duplicated ? (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[0.65rem] font-black text-amber-900">
                              DUPLICADO
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePackage(item.id)}
                        className={`mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-black ${
                          duplicated
                            ? "bg-rose-700 text-white"
                            : "border border-slate-300 bg-white text-slate-700"
                        }`}
                        aria-label={`${
                          packagesFullscreenMode === "manual-remove"
                            ? "Remover do teste"
                            : duplicated
                              ? "Remover repetição"
                              : "Remover pacote"
                        } ${item.code}`}
                      >
                        {packagesFullscreenMode === "manual-remove"
                          ? "Remover do teste"
                          : duplicated
                            ? "Remover repetição"
                            : "Remover pacote"}
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : packagesFullscreenMode === "manual-remove" &&
              !manualRemovalHasQuery &&
              packages.length ? (
              <div className="grid min-h-full place-items-center px-5 py-10 text-center">
                <div>
                  <span
                    className="mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-2xl font-black text-amber-800"
                    aria-hidden="true"
                  >
                    ⌕
                  </span>
                  <h3 className="mt-4 text-xl font-black">Localize a leitura</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    Digite ou bipe o código acima. A remoção só acontece após
                    tocar no resultado.
                  </p>
                </div>
              </div>
            ) : packages.length ? (
              <div className="grid min-h-full place-items-center px-5 py-10 text-center">
                <div>
                  <span
                    className="mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-2xl font-black text-amber-800"
                    aria-hidden="true"
                  >
                    ?
                  </span>
                  <h3 className="mt-4 text-xl font-black">Código não encontrado</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    Confira o código digitado ou apague a busca para ver todas
                    as leituras.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid min-h-full place-items-center px-5 py-10 text-center">
                <div>
                  <h3 className="text-xl font-black">Nenhum pacote bipado</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    Volte à bipagem para adicionar o primeiro código.
                  </p>
                </div>
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2 shadow-[0_-14px_36px_-24px_rgba(15,23,42,0.55)]">
            <div className="mx-auto w-full max-w-xl pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={closePackagesFullscreen}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white"
              >
                Voltar à bipagem
              </button>
            </div>
          </footer>
        </section>
      ) : null}

      {optionsOpen ? (
        <section
          id="demo-options"
          ref={optionsDialogRef}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-end bg-slate-950/55 px-3 pt-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-options-title"
        >
          <div className="mx-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl [scrollbar-gutter:stable]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.65rem] font-black uppercase tracking-[0.15em] text-slate-400">
                  Lote de demonstração
                </p>
                <h2 id="demo-options-title" className="mt-1 text-lg font-black text-slate-950">
                  Opções da bipagem
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDemoOptions}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-black text-slate-700"
              >
                Fechar
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button ref={packagesFullscreenTriggerRef} type="button" onClick={openPackagesFullscreen} disabled={!packages.length} aria-haspopup="dialog" className="col-span-2 min-h-11 rounded-xl border border-teal-200 bg-teal-50 text-sm font-black text-teal-900 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">Ver pacotes em tela cheia</button>
              <button type="button" onClick={openManualRemoval} disabled={!packages.length || busy} aria-haspopup="dialog" className="col-span-2 min-h-11 rounded-xl border border-amber-300 bg-amber-50 text-sm font-black text-amber-900 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">Remover código manualmente</button>
              <button ref={manualOptionRef} type="button" onClick={openManualEntry} className="min-h-11 rounded-xl border border-slate-200 text-sm font-black text-slate-700">Adicionar código</button>
              <button type="button" onClick={showDuplicates} disabled={!duplicateExcess} className="min-h-11 rounded-xl border border-amber-200 bg-amber-50 text-sm font-black text-amber-900 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">Corrigir duplicados</button>
              <button type="button" onClick={() => { setOptionsOpen(false); setPendingAction("clear"); }} disabled={!packages.length} className="min-h-11 rounded-xl border border-slate-200 text-sm font-black text-slate-700 disabled:bg-slate-100 disabled:text-slate-400">Limpar leituras</button>
              <button type="button" onClick={() => { setOptionsOpen(false); setPendingAction("exit"); }} className="min-h-11 rounded-xl border border-rose-200 bg-rose-50 text-sm font-black text-rose-700">Sair da bipagem</button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pt-2 shadow-[0_-14px_36px_-24px_rgba(15,23,42,0.55)] backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <button ref={optionsTriggerRef} type="button" onClick={() => setOptionsOpen((current) => !current)} aria-expanded={optionsOpen} aria-controls="demo-options" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700">
            Opções
          </button>
          <button
            type="button"
            onClick={showOnlyDuplicates ? returnToScanning : duplicateExcess > 0 ? showDuplicates : finishDemo}
            disabled={!packages.length || busy}
            className={`inline-flex min-h-12 flex-1 items-center justify-center rounded-xl px-4 text-sm font-black text-white disabled:bg-slate-300 ${duplicateExcess > 0 ? "bg-amber-600" : "bg-teal-700"}`}
          >
            {showOnlyDuplicates
              ? "Voltar à bipagem"
              : duplicateExcess > 0
                ? `Corrigir ${duplicateExcess} duplicado${duplicateExcess === 1 ? "" : "s"}`
                : "Finalizar bipagem"}
          </button>
        </div>
      </div>

      {pendingAction ? (
        <div className="fixed inset-0 z-[90] grid place-items-end bg-slate-950/55 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:place-items-center" role="presentation">
          <section ref={pendingActionDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="confirm-action-title" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h2 id="confirm-action-title" className="text-lg font-black text-slate-950">
              {pendingAction === "clear" ? "Limpar todas as leituras?" : "Sair da bipagem?"}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {pendingAction === "clear"
                ? "Os códigos deste teste serão apagados e a câmera será reiniciada."
                : "O lote de teste será encerrado e todas as leituras serão apagadas."}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button ref={pendingActionInitialFocusRef} type="button" onClick={closePendingAction} className="min-h-12 rounded-xl border border-slate-300 text-sm font-black text-slate-700">Voltar</button>
              <button type="button" onClick={confirmPendingAction} className="min-h-12 rounded-xl bg-rose-700 text-sm font-black text-white">Confirmar</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
