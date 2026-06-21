"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { useAuth, AuthProvider } from "@/app/_lib/auth-context";
import { Navigation } from "@/app/_components/navigation";

function FullScreenState({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f5f7fb] px-4 text-slate-950">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-lg bg-slate-950 text-sm font-semibold text-white">
          SD
        </div>
        <div className="mt-4 text-sm font-semibold text-slate-700">
          {children}
        </div>
      </div>
    </div>
  );
}

function UserSessionBox({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const email = user?.email ?? "";

  async function handleSignOut() {
    setSigningOut(true);
    setError("");

    try {
      await signOut();
      router.replace("/login");
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "Nao foi possivel sair da conta.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div
      className={
        compact
          ? "flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
          : "absolute inset-x-5 bottom-6 rounded-lg border border-slate-200 bg-slate-50 p-4"
      }
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Usuario
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-slate-950">
          {email || "Sessao ativa"}
        </p>
        {error ? <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p> : null}
      </div>
      <button
        type="button"
        disabled={signingOut}
        onClick={handleSignOut}
        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        {signingOut ? "Saindo..." : "Sair"}
      </button>
    </div>
  );
}

function ProtectedAppShell({ children }: { children: ReactNode }) {
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
              <p className="text-xs text-slate-500">Operacao autenticada</p>
            </div>
          </div>
        </div>
        <Navigation />
        <UserSessionBox />
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:hidden">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-slate-950 text-xs font-semibold text-white">
                SD
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  Sistema Despacho
                </p>
                <p className="text-xs text-slate-500">Operacao autenticada</p>
              </div>
            </div>
          </div>
          <div className="grid gap-3">
            <UserSessionBox compact />
            <Navigation compact />
          </div>
        </header>

        <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function AppShellContent({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, session } = useAuth();
  const isLoginRoute = pathname === "/login";

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!session && !isLoginRoute) {
      router.replace("/login");
      return;
    }

    if (session && isLoginRoute) {
      router.replace("/dashboard");
    }
  }, [isLoginRoute, loading, router, session]);

  if (loading) {
    return <FullScreenState>Verificando sessao...</FullScreenState>;
  }

  if (!session && !isLoginRoute) {
    return <FullScreenState>Redirecionando para o login...</FullScreenState>;
  }

  if (session && isLoginRoute) {
    return <FullScreenState>Entrando no sistema...</FullScreenState>;
  }

  if (isLoginRoute) {
    return <>{children}</>;
  }

  return <ProtectedAppShell>{children}</ProtectedAppShell>;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AppShellContent>{children}</AppShellContent>
    </AuthProvider>
  );
}
