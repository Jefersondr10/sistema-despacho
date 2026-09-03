import Link from "next/link";
import type { ReactNode } from "react";

type LegalDocumentPageProps = {
  eyebrow: string;
  title: string;
  introduction: string;
  children: ReactNode;
};

export function LegalDocumentPage({
  eyebrow,
  title,
  introduction,
  children,
}: LegalDocumentPageProps) {
  return (
    <main className="min-h-dvh px-4 py-6 text-slate-950 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/90 bg-white/95 px-5 py-5 shadow-[0_20px_60px_-42px_rgba(15,23,42,0.55)] ring-1 ring-slate-200/70 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <Link
            href="/login"
            className="inline-flex w-fit items-center gap-3 rounded-xl text-slate-950 transition hover:text-teal-800"
            aria-label="Ir para o acesso do Sistema de Despacho"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-teal-600 to-teal-800 text-xs font-black tracking-wide text-white shadow-md shadow-teal-900/20">
              SD
            </span>
            <span>
              <span className="block text-sm font-bold leading-tight">
                Sistema de Despacho
              </span>
              <span className="block text-xs text-slate-500">
                Núcleo de Operação
              </span>
            </span>
          </Link>

          <nav
            className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-slate-600"
            aria-label="Documentos e acesso"
          >
            <Link className="transition hover:text-teal-800" href="/privacidade">
              Privacidade
            </Link>
            <Link className="transition hover:text-teal-800" href="/termos">
              Termos de uso
            </Link>
            <Link
              className="inline-flex min-h-10 items-center rounded-xl bg-teal-700 px-4 text-white shadow-sm transition hover:bg-teal-800"
              href="/login"
            >
              Entrar
            </Link>
          </nav>
        </header>

        <article className="mt-5 overflow-hidden rounded-[2rem] border border-white/90 bg-white/95 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.6)] ring-1 ring-slate-200/70">
          <div className="relative overflow-hidden bg-gradient-to-br from-teal-800 via-teal-700 to-slate-900 px-6 py-10 text-white sm:px-10 sm:py-12">
            <div
              className="absolute -right-24 -top-28 size-72 rounded-full border border-white/10 bg-white/5"
              aria-hidden="true"
            />
            <p className="relative text-xs font-bold uppercase tracking-[0.18em] text-teal-200">
              {eyebrow}
            </p>
            <h1 className="relative mt-3 max-w-3xl text-3xl font-bold leading-tight tracking-[-0.04em] sm:text-4xl">
              {title}
            </h1>
            <p className="relative mt-4 max-w-3xl text-sm leading-7 text-teal-50/85 sm:text-base">
              {introduction}
            </p>
            <p className="relative mt-5 text-xs font-semibold text-teal-100/80">
              Última atualização: 3 de setembro de 2026.
            </p>
          </div>

          <div className="legal-document grid gap-8 px-6 py-8 text-sm leading-7 text-slate-600 sm:px-10 sm:py-10 sm:text-[0.95rem]">
            {children}
          </div>
        </article>

        <footer className="px-4 py-7 text-center text-xs leading-5 text-slate-500">
          Dúvidas sobre estes documentos? Escreva para{" "}
          <a
            className="font-semibold text-teal-800 underline decoration-teal-300 underline-offset-4 hover:text-teal-950"
            href="mailto:jefersondr10@gmail.com"
          >
            jefersondr10@gmail.com
          </a>
          .
        </footer>
      </div>
    </main>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-bold tracking-[-0.025em] text-slate-950">
        {title}
      </h2>
      <div className="mt-2 grid gap-3">{children}</div>
    </section>
  );
}
