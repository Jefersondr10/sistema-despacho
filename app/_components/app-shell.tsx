"use client";

import type { ReactNode } from "react";

import { Navigation } from "@/app/_components/navigation";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 shadow-sm backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 sm:px-2 lg:flex-row lg:items-center">
          <div className="flex shrink-0 items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-slate-950 text-sm font-semibold text-white">
              SD
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">
                Sistema Despacho
              </p>
              <p className="text-xs text-slate-500">Operação por loja</p>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <Navigation compact />
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
