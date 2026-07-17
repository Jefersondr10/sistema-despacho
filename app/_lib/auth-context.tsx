"use client";

import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { clearAccountScopedBrowserState } from "@/app/_lib/account-scope";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  SUPABASE_NOT_CONFIGURED_MESSAGE,
} from "@/lib/supabaseClient";

type SignUpInput = {
  name?: string;
  email: string;
  password: string;
};

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  error: string;
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<{ session: Session | null }>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getAuthErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : "";
  const message = rawMessage.toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "E-mail ou senha invalidos.";
  }

  if (message.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar.";
  }

  if (message.includes("session") || message.includes("jwt")) {
    return "Sua sessao expirou. Entre novamente.";
  }

  if (message.includes("failed to fetch") || message.includes("network")) {
    return "Falha de conexao com o Supabase. Verifique sua internet.";
  }

  return rawMessage || "Nao foi possivel concluir a autenticacao.";
}

function getRedirectUrl() {
  return typeof window === "undefined" ? undefined : `${window.location.origin}/login`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState(
    configured ? "" : SUPABASE_NOT_CONFIGURED_MESSAGE,
  );
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!configured) {
      return;
    }

    let active = true;
    let authEventReceived = false;
    const supabase = getSupabaseClient();

    function applySession(
      nextSession: Session | null,
      event?: AuthChangeEvent,
      nextError = "",
    ) {
      if (!active) return;

      const nextUserId = nextSession?.user.id ?? null;
      if (userIdRef.current !== nextUserId) {
        clearAccountScopedBrowserState();
        userIdRef.current = nextUserId;
      }

      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      } else if (!nextSession) {
        setPasswordRecovery(false);
      }

      setSession(nextSession);
      setError(nextError);
      setLoading(false);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authEventReceived = true;
      applySession(nextSession, event);
    });

    void supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!active || authEventReceived) return;

      if (sessionError) {
        applySession(null, undefined, getAuthErrorMessage(sessionError));
        return;
      }

      if (!data.session) {
        applySession(null);
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!active || authEventReceived) return;

      if (userError || !userData.user) {
        applySession(null, undefined, getAuthErrorMessage(userError));
        return;
      }

      applySession(data.session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [configured]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      loading,
      session,
      user: session?.user ?? null,
      error,
      passwordRecovery,
      async signIn(email: string, password: string) {
        if (!configured) throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);

        const { error: signInError } =
          await getSupabaseClient().auth.signInWithPassword({ email, password });
        if (signInError) throw new Error(getAuthErrorMessage(signInError));
      },
      async signUp(input: SignUpInput) {
        if (!configured) throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);

        const { data, error: signUpError } = await getSupabaseClient().auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            emailRedirectTo: getRedirectUrl(),
            data: input.name?.trim() ? { name: input.name.trim() } : undefined,
          },
        });
        if (signUpError) throw new Error(getAuthErrorMessage(signUpError));

        return { session: data.session ?? null };
      },
      async requestPasswordReset(email: string) {
        if (!configured) throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);

        const { error: resetError } =
          await getSupabaseClient().auth.resetPasswordForEmail(email, {
            redirectTo: getRedirectUrl(),
          });
        if (resetError) throw new Error(getAuthErrorMessage(resetError));
      },
      async updatePassword(password: string) {
        if (!configured) throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);

        const { error: updateError } =
          await getSupabaseClient().auth.updateUser({ password });
        if (updateError) throw new Error(getAuthErrorMessage(updateError));
        setPasswordRecovery(false);
      },
      async signOut() {
        clearAccountScopedBrowserState();
        userIdRef.current = null;
        setSession(null);
        setPasswordRecovery(false);
        setError("");
        setLoading(false);
        if (!configured) return;

        const { error: signOutError } = await getSupabaseClient().auth.signOut();
        if (signOutError) throw new Error(getAuthErrorMessage(signOutError));
      },
    }),
    [configured, error, loading, passwordRecovery, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }

  return context;
}
