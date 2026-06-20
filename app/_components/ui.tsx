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
      className={`inline-flex min-h-7 items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${badgeClasses[tone]}`}
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
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">
          Sistema de despacho
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950 md:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
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
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div
        className={`mb-4 inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}
      >
        {label}
      </div>
      <p className="text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
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
      className={`rounded-lg border px-4 py-3 text-sm font-semibold ${feedbackClasses[tone]}`}
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
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <h2 id="dialog-title" className="text-lg font-semibold text-slate-950">
          {title}
        </h2>
        <div className="mt-2 text-sm leading-6 text-slate-600">{message}</div>
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-100"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold transition focus:outline-none focus:ring-4 ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
