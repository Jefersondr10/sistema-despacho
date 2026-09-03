"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export const CURRENT_RELEASE_ID = "2026-09-02-rastreio-mercado-livre";
export const RELEASE_NOTICE_STORAGE_KEY =
  "sistema-despacho-device:novidades-versao";

const releaseItems = [
  {
    title: "Rastreios do Mercado Livre corrigidos",
    description:
      "Códigos numéricos iniciados por 478 ou 479 agora são reconhecidos sem o aviso incorreto de telefone nos lotes do Mercado Livre.",
  },
  {
    title: "Permissões sob medida",
    description:
      "Ao criar ou editar um acesso, marque exatamente quais áreas e ações cada pessoa poderá usar.",
  },
  {
    title: "Login individual",
    description:
      "Cada funcionário continua entrando com seu próprio e-mail e senha, e as ações permanecem registradas em seu nome.",
  },
  {
    title: "Operação protegida",
    description:
      "O proprietário mantém acesso total e as permissões são verificadas também nas ações críticas, sem alterar os lotes existentes.",
  },
] as const;

export function WhatsNewNotice() {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const eligible = pathname === "/dashboard";

  useEffect(() => {
    if (!eligible) return;

    const timer = window.setTimeout(() => {
      try {
        setOpen(
          window.localStorage.getItem(RELEASE_NOTICE_STORAGE_KEY) !==
            CURRENT_RELEASE_ID,
        );
      } catch {
        setOpen(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [eligible]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (eligible && open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [eligible, open]);

  function dismiss() {
    try {
      window.localStorage.setItem(
        RELEASE_NOTICE_STORAGE_KEY,
        CURRENT_RELEASE_ID,
      );
    } catch {
      // O aviso continua funcional durante esta sessão sem armazenamento local.
    }

    setOpen(false);
  }

  if (!eligible) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="whats-new-title"
      aria-describedby="whats-new-description"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-3xl border border-white/90 bg-white p-0 text-slate-950 shadow-[0_30px_90px_-30px_rgba(15,23,42,0.65)] outline-none backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm"
    >
      <div className="bg-gradient-to-br from-teal-800 via-teal-700 to-cyan-700 px-5 pb-6 pt-5 text-white sm:px-7 sm:pt-7">
        <div className="flex items-center gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-6"
            >
              <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
              <path d="m5.6 5.6 2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-100">
              Atualização concluída
            </p>
            <h2
              id="whats-new-title"
              className="mt-1 text-2xl font-bold tracking-[-0.03em]"
            >
              Novidades no Sistema Despacho
            </h2>
          </div>
        </div>
        <p
          id="whats-new-description"
          className="mt-4 text-sm leading-6 text-teal-50"
        >
          Veja o que mudou desde seu último acesso.
        </p>
      </div>

      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-7 sm:pb-7">
        <ul className="grid gap-3">
          {releaseItems.map((item, index) => (
            <li
              key={item.title}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5"
            >
              <span
                className="grid size-8 place-items-center rounded-xl bg-teal-100 text-sm font-black text-teal-800"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="font-bold text-slate-950">{item.title}</p>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  {item.description}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          autoFocus
          onClick={dismiss}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-bold text-white shadow-lg shadow-teal-900/15 transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          Entendi, continuar
        </button>
      </div>
    </dialog>
  );
}
