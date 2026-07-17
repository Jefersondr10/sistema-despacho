"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Navigation } from "@/app/_components/navigation";
import { AuthProvider, useAuth } from "@/app/_lib/auth-context";

function FullScreenState({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f5f7fb] px-4 text-slate-950">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-lg bg-slate-950 text-sm font-semibold text-white">
          SD
        </div>
        <div className="mt-4 text-sm font-semibold text-slate-700">{children}</div>
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
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
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
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 shadow-sm backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 sm:px-2 lg:flex-row lg:items-center">
          <div className="flex shrink-0 items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-slate-950 text-sm font-semibold text-white">
              SD
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">Sistema Despacho</p>
              <p className="text-xs text-slate-500">Operacao isolada por conta</p>
            </div>
          </div>
          <div className="min-w-0 flex-1"><Navigation compact /></div>
          <div className="shrink-0 lg:w-72"><UserSessionBox /></div>
        </div>
      </header>
      <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
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
