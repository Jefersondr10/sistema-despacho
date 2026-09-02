"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Navigation } from "@/app/_components/navigation";
import { InstallAppButton } from "@/app/_components/pwa-install";
import { WhatsNewNotice } from "@/app/_components/whats-new-notice";
import { AuthProvider, useAuth } from "@/app/_lib/auth-context";
import { FeedbackAdminAccessProvider } from "@/app/_lib/feedback-admin-access";
import { TeamProvider, useTeam } from "@/app/_lib/team-context";
import {
  canAccessTeamPathname,
  getFirstAllowedTeamRoute,
} from "@/app/equipe/team-contract";

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-800 text-white shadow-lg shadow-teal-950/20 ring-1 ring-white/20 ${
        compact ? "size-10" : "size-12"
      }`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={compact ? "size-5" : "size-6"}
      >
        <path d="m5 8 7-3.5L19 8l-7 3.5L5 8Z" />
        <path d="M5 8v8l7 3.5 7-3.5V8M12 11.5v8" />
        <path d="M3 4h3M18 4h3M3 20h2M19 20h2" />
      </svg>
    </div>
  );
}

function FullScreenState({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-6 text-slate-950">
      <div className="w-full max-w-md rounded-3xl border border-white/90 bg-white/90 p-6 text-center shadow-[0_24px_70px_-30px_rgba(15,23,42,0.3)] ring-1 ring-slate-200/60 backdrop-blur-xl sm:p-8">
        <div className="flex justify-center">
          <BrandMark />
        </div>
        <div className="mt-5 text-sm font-semibold tracking-[-0.01em] text-slate-700">
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

  if (compact) {
    return (
      <div>
        <button
          type="button"
          disabled={signingOut}
          onClick={handleSignOut}
          aria-label={`Sair da conta ${user?.email ?? "ativa"}`}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          {signingOut ? "Saindo..." : "Sair"}
        </button>
        {error ? (
          <p
            className="mt-1 max-w-40 text-right text-[0.65rem] font-semibold text-rose-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/85 p-2.5 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.5)] ring-1 ring-white/80">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-[1.125rem]"
          >
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Conta ativa
          </p>
          <p className="mt-0.5 truncate text-xs font-semibold tracking-[-0.01em] text-slate-800 sm:text-sm">
            {user?.email ?? "Sessão ativa"}
          </p>
        </div>
        {error ? (
          <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={signingOut}
        onClick={handleSignOut}
        className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 shadow-sm transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:ring-4 focus-visible:ring-rose-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:px-3 sm:text-sm"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
          aria-hidden="true"
        >
          <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" />
        </svg>
        {signingOut ? "Saindo..." : "Sair"}
      </button>
    </div>
  );
}

function ProtectedAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMobileBipagem = pathname === "/bipagem";
  const { user } = useAuth();
  const { context: teamContext } = useTeam();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const accountEmail = user?.email ?? "Sessão ativa";
  const homeRoute = getFirstAllowedTeamRoute(teamContext);

  return (
    <div className="min-h-dvh min-w-0 text-slate-950 xl:grid xl:grid-cols-[clamp(248px,19vw,288px)_minmax(0,1fr)]">
      <WhatsNewNotice />
      <aside className="sticky top-0 hidden h-dvh min-h-0 flex-col overflow-hidden border-r border-slate-200/80 bg-gradient-to-b from-white/95 via-white/88 to-slate-50/90 p-4 shadow-[10px_0_40px_rgba(15,23,42,0.045)] backdrop-blur-xl xl:flex xl:p-5">
        <Link
          href={homeRoute}
          aria-label="Ir para o início"
          className="group flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-white/80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          <BrandMark />
          <div>
            <p className="font-bold tracking-[-0.025em] text-slate-950 transition-colors group-hover:text-teal-800">
              Sistema Despacho
            </p>
            <p className="mt-0.5 text-xs font-medium tracking-[-0.01em] text-slate-500">
              Controle de expedição
            </p>
          </div>
        </Link>
        <div className="app-scroll-region mt-7 min-h-0 flex-1 overflow-y-auto pr-1">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.19em] text-slate-400">
            Menu principal
          </p>
          <Navigation />
        </div>
        <div className="shrink-0 border-t border-slate-200/70 pt-4">
          <InstallAppButton className="mb-3" />
          <UserSessionBox />
        </div>
      </aside>

      <div className="min-w-0 overflow-x-clip">
        <header className="mobile-app-shell-header app-scroll-region sticky top-0 z-30 max-h-[55dvh] overflow-y-auto border-b border-slate-200/80 bg-white/90 px-3 py-3 shadow-[0_8px_30px_-24px_rgba(15,23,42,0.4)] backdrop-blur-xl sm:px-5 xl:hidden">
          <div className="md:hidden">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href={homeRoute}
                onNavigate={() => setMobileMenuOpen(false)}
                aria-label="Ir para o início"
                className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl py-1 pr-1 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
              >
                <BrandMark compact />
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <p className="shrink-0 text-sm font-bold tracking-[-0.02em] text-slate-950 transition-colors group-hover:text-teal-800">
                      Sistema Despacho
                    </p>
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-teal-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-teal-700">
                      Conta ativa
                    </span>
                  </div>
                  <p
                    className="mt-0.5 truncate text-xs font-medium text-slate-500"
                    title={accountEmail}
                  >
                    {accountEmail}
                  </p>
                </div>
              </Link>
              <button
                type="button"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-primary-menu"
                aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
                onClick={() => setMobileMenuOpen((open) => !open)}
                className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="size-5"
                  aria-hidden="true"
                >
                  {mobileMenuOpen ? (
                    <>
                      <path d="m6 6 12 12" />
                      <path d="m18 6-12 12" />
                    </>
                  ) : (
                    <>
                      <path d="M4 7h16" />
                      <path d="M4 12h16" />
                      <path d="M4 17h16" />
                    </>
                  )}
                </svg>
              </button>
              <UserSessionBox compact />
            </div>
            {mobileMenuOpen ? (
              <div
                id="mobile-primary-menu"
                className="mt-3 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-2 shadow-inner"
              >
                <Navigation onNavigate={() => setMobileMenuOpen(false)} />
                <InstallAppButton compact className="mt-2" />
              </div>
            ) : null}
          </div>

          <div className="hidden md:block">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={homeRoute}
                aria-label="Ir para o início"
                className="flex shrink-0 items-center gap-3 rounded-2xl transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
              >
                <BrandMark compact />
                <div>
                  <p className="text-sm font-bold tracking-[-0.02em] text-slate-950">
                    Sistema Despacho
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    Controle de expedição
                  </p>
                </div>
              </Link>
              {isMobileBipagem ? (
                <UserSessionBox compact />
              ) : (
                <div className="hidden min-w-0 sm:block sm:w-64">
                  <UserSessionBox />
                </div>
              )}
            </div>
            <div className={isMobileBipagem ? "mt-2" : "mt-3"}>
              <Navigation compact />
            </div>
            <InstallAppButton compact className="mt-2" />
          </div>
        </header>

        <main className="mx-auto flex min-h-dvh min-w-0 w-full max-w-[1640px] flex-col gap-5 px-3 py-4 sm:gap-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8 2xl:px-12 2xl:py-10">
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
  const {
    context: teamContext,
    loading: teamLoading,
    error: teamError,
  } = useTeam();
  const isLoginRoute = pathname === "/login";
  const canStayOnLogin = isLoginRoute && passwordRecovery;
  const firstAllowedRoute = getFirstAllowedTeamRoute(teamContext);
  const canAccessCurrentRoute = canAccessTeamPathname(pathname, teamContext);

  useEffect(() => {
    if (loading) return;

    if (!session && !isLoginRoute) {
      router.replace("/login");
    } else if (session && isLoginRoute && !passwordRecovery) {
      if (!teamLoading && teamContext) router.replace(firstAllowedRoute);
    } else if (
      session &&
      !isLoginRoute &&
      !teamLoading &&
      teamContext &&
      !canAccessCurrentRoute
    ) {
      router.replace(firstAllowedRoute);
    }
  }, [
    canAccessCurrentRoute,
    firstAllowedRoute,
    isLoginRoute,
    loading,
    passwordRecovery,
    router,
    session,
    teamContext,
    teamLoading,
  ]);

  if (loading) {
    return <FullScreenState>Verificando sessao...</FullScreenState>;
  }
  if (!session && !isLoginRoute) {
    return <FullScreenState>Redirecionando para o login...</FullScreenState>;
  }
  if (session && !canStayOnLogin && teamLoading) {
    return <FullScreenState>Carregando seus acessos...</FullScreenState>;
  }
  if (session && !canStayOnLogin && teamError) {
    return <FullScreenState>{teamError}</FullScreenState>;
  }
  if (session && !canStayOnLogin && !teamContext) {
    return <FullScreenState>Não foi possível identificar seus acessos.</FullScreenState>;
  }
  if (session && isLoginRoute && !canStayOnLogin) {
    return <FullScreenState>Entrando no sistema...</FullScreenState>;
  }
  if (isLoginRoute) return <>{children}</>;
  if (!canAccessCurrentRoute) {
    return <FullScreenState>Redirecionando para uma área liberada...</FullScreenState>;
  }

  return (
    <ProtectedAppShell key={session?.user.id ?? "sem-sessao"}>
      {children}
    </ProtectedAppShell>
  );
}

export function AuthenticatedAppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <TeamProvider>
        <FeedbackAdminAccessProvider>
          <AppShellContent>{children}</AppShellContent>
        </FeedbackAdminAccessProvider>
      </TeamProvider>
    </AuthProvider>
  );
}
