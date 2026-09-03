"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const AuthenticatedAppShell = dynamic<{ children: ReactNode }>(
  () =>
    import("./authenticated-app-shell").then(
      (module) => module.AuthenticatedAppShell,
    ),
  {
    loading: () => (
      <div
        className="grid min-h-dvh place-items-center px-4 py-6 text-sm font-semibold text-slate-700"
        role="status"
      >
        Carregando sistema...
      </div>
    ),
  },
);

const PUBLIC_STANDALONE_ROUTES = new Set([
  "/privacidade",
  "/termos",
]);

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (
    pathname === "/demonstracao-bipagem" ||
    PUBLIC_STANDALONE_ROUTES.has(pathname)
  ) {
    return <>{children}</>;
  }

  return <AuthenticatedAppShell>{children}</AuthenticatedAppShell>;
}
