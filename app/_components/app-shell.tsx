"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Navigation } from "@/app/_components/navigation";
import { AuthProvider, useAuth } from "@/app/_lib/auth-context";

function FullScreenState({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-4 text-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-white/80 bg-white/90 p-7 text-center shadow-xl shadow-slate-900/10 backdrop-blur">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 text-sm font-bold tracking-wide text-white shadow-lg shadow-teal-900/20">
          SD
        </div>
        <div className="mt-5 text-sm font-semibold text-slate-700">{children}</div>
      </div>
    </div>
  );
}

function UserSessionBox() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

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
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/75 p-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Conta
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-slate-950">
          {user?.email ?? "Sessao ativa"}
        </p>
        {error ? <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p> : null}
      </div>
      <button
        type="button"
        disabled={signingOut}
        onClick={handleSignOut}
        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        {signingOut ? "Saindo..." : "Sair"}
      </button>
    </div>
  );
}

function ProtectedAppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen text-slate-950 lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-slate-200/80 bg-white/80 p-5 shadow-[8px_0_32px_rgba(15,23,42,0.035)] backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-teal-600 to-teal-800 text-sm font-bold tracking-wide text-white shadow-lg shadow-teal-900/20">
            SD
          </div>
          <div>
            <p className="font-bold tracking-tight text-slate-950">Sistema Despacho</p>
            <p className="text-xs font-medium text-slate-500">Operação de pacotes</p>
          </div>
        </div>
        <div className="mt-7 flex-1">
          <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Menu principal
          </p>
          <Navigation />
        </div>
        <UserSessionBox />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-xl lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex shrink-0 items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-teal-600 to-teal-800 text-xs font-bold text-white shadow-md shadow-teal-900/15">
                SD
              </div>
              <div>
                <p className="text-sm font-bold text-slate-950">Sistema Despacho</p>
                <p className="text-xs text-slate-500">Gestão de pacotes</p>
              </div>
            </div>
            <div className="hidden min-w-0 sm:block sm:w-64"><UserSessionBox /></div>
          </div>
          <div className="mt-3"><Navigation compact /></div>
          <div className="mt-1 sm:hidden"><UserSessionBox /></div>
        </header>

        <main className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 xl:px-10 xl:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

function AppShellContent({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, session, passwordRecovery } = useAuth();
  const isLoginRoute = pathname === "/login";
  const canStayOnLogin = isLoginRoute && passwordRecovery;

  useEffect(() => {
    if (loading) return;

    if (!session && !isLoginRoute) {
      router.replace("/login");
    } else if (session && isLoginRoute && !passwordRecovery) {
      router.replace("/dashboard");
    }
  }, [isLoginRoute, loading, passwordRecovery, router, session]);

  if (loading) return <FullScreenState>Verificando sessao...</FullScreenState>;
  if (!session && !isLoginRoute) {
    return <FullScreenState>Redirecionando para o login...</FullScreenState>;
  }
  if (session && isLoginRoute && !canStayOnLogin) {
    return <FullScreenState>Entrando no sistema...</FullScreenState>;
  }
  if (isLoginRoute) return <>{children}</>;

  return (
    <ProtectedAppShell key={session?.user.id ?? "sem-sessao"}>
      {children}
    </ProtectedAppShell>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AppShellContent>{children}</AppShellContent>
    </AuthProvider>
  );
}
