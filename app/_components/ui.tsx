import type { ReactNode } from "react";

import type { OperationType, PackageStatus } from "@/app/_lib/mock-data";
import { getOperationLabel } from "@/app/_lib/mock-data";

type BadgeTone = "neutral" | "green" | "amber" | "blue" | "red" | "purple";

const badgeClasses: Record<BadgeTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  blue: "border-sky-200 bg-sky-50 text-sky-700",
  red: "border-rose-200 bg-rose-50 text-rose-700",
  purple: "border-violet-200 bg-violet-50 text-violet-700",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`inline-flex min-h-7 max-w-full min-w-0 items-center justify-center whitespace-normal break-words rounded-full border px-2.5 py-1 text-center text-xs font-semibold leading-4 ${badgeClasses[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: PackageStatus | string }) {
  const tone: BadgeTone =
    status === "Finalizado" ||
    status === "Pronto para envio" ||
    status === "Ativa" ||
    status === "Ativo"
      ? "green"
      : status === "Pendente na sessão" ||
          status === "Pendente no lote" ||
          status === "Em separação" ||
          status === "Pendente" ||
          status === "Em homologação"
        ? "amber"
        : status === "Cancelado"
          ? "red"
          : "blue";

  return <Badge tone={tone}>{status}</Badge>;
}

export function MelhorEnvioBadge({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? "green" : "neutral"}>
      Melhor Envio: {active ? "Sim" : "Não"}
    </Badge>
  );
}

export function OperationBadge({ operation }: { operation: OperationType }) {
  const tone: BadgeTone = operation === "coleta" ? "amber" : "blue";

  return <Badge tone={tone}>{getOperationLabel(operation)}</Badge>;
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/90 px-5 py-5 shadow-sm shadow-slate-900/5 ring-1 ring-slate-200/70 sm:px-7 sm:py-6 md:flex md:items-end md:justify-between md:gap-6">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-teal-500 via-teal-700 to-sky-600" aria-hidden="true" />
      <div className="min-w-0">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-teal-700 before:block before:size-2 before:rounded-full before:bg-teal-500">
          Central de despacho
        </p>
        <h1 className="mt-2 break-words text-[clamp(1.8rem,4vw,2.5rem)] font-bold leading-tight tracking-[-0.035em] text-slate-950">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="mt-5 flex w-full min-w-0 flex-wrap items-center gap-2 md:mt-0 md:w-auto md:shrink-0 md:justify-end">
          {action}
        </div>
      ) : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  tone = "teal",
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "teal" | "amber" | "rose" | "slate" | "blue";
}) {
  const toneClasses = {
    teal: "border-teal-100 bg-teal-50 text-teal-700",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
    rose: "border-rose-100 bg-rose-50 text-rose-700",
    slate: "border-slate-200 bg-white text-slate-700",
    blue: "border-sky-100 bg-sky-50 text-sky-700",
  };

  return (
    <div className="group relative min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/5 sm:p-5">
      <div className="absolute -right-8 -top-8 size-24 rounded-full bg-gradient-to-br from-teal-50 to-transparent opacity-80" />
      <div
        className={`relative mb-4 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}
      >
        {label}
      </div>
      <p className="relative break-words text-[clamp(1.75rem,4vw,2.25rem)] font-bold leading-none tracking-tight text-slate-950">{value}</p>
      <p className="relative mt-2 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-5 text-center text-sm leading-6 text-slate-600 sm:p-8">
      {children}
    </div>
  );
}

type FeedbackTone = "success" | "warning" | "danger" | "neutral";

const feedbackClasses: Record<FeedbackTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-300 bg-rose-50 text-rose-800",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
};

export function FeedbackMessage({
  tone = "neutral",
  children,
}: {
  tone?: FeedbackTone;
  children: ReactNode;
}) {
  return (
    <div
      className={`min-w-0 break-words rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm ${feedbackClasses[tone]}`}
      role="status"
      aria-live="polite"
    >
      {children}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  cancelLabel = "Cancelar",
  confirmLabel = "Confirmar",
  tone = "neutral",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  tone?: "neutral" | "danger";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) {
    return null;
  }

  const confirmClass =
    tone === "danger"
      ? "bg-rose-700 text-white hover:bg-rose-800 focus:ring-rose-100"
      : "bg-slate-950 text-white hover:bg-slate-800 focus:ring-slate-200";

  return (
    <div
      className="app-scroll-region fixed inset-0 z-50 grid overflow-y-auto bg-slate-950/55 px-3 py-4 backdrop-blur-sm sm:place-items-center sm:px-4 sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div className="app-scroll-region my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-white/80 bg-white p-5 shadow-2xl shadow-slate-950/20 sm:max-h-[calc(100dvh-3rem)] sm:p-6">
        <h2 id="dialog-title" className="text-xl font-bold tracking-tight text-slate-950">
          {title}
        </h2>
        <div className="mt-2 text-sm leading-6 text-slate-600">{message}</div>
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-100"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
