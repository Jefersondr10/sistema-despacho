import type { ReactNode } from "react";

import { Navigation } from "@/app/_components/navigation";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-slate-200 bg-white px-5 py-6 lg:block">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-slate-950 text-sm font-semibold text-white">
              SD
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">
                Sistema Despacho
              </p>
              <p className="text-xs text-slate-500">Operação visual</p>
            </div>
          </div>
        </div>
        <Navigation />
        <div className="absolute inset-x-5 bottom-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Versão inicial
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Dados mockados, sem login e sem banco.
          </p>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:hidden">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-slate-950 text-xs font-semibold text-white">
                SD
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  Sistema Despacho
                </p>
                <p className="text-xs text-slate-500">Versão visual</p>
              </div>
            </div>
          </div>
          <Navigation compact />
        </header>

        <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
