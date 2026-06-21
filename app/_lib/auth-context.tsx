"use client";

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<{ session: Session | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getAuthErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = String((error as { message?: unknown }).message || "");
    if (message) return message;
  }

  return "Nao foi possivel concluir a autenticacao.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState(
    configured ? "" : SUPABASE_NOT_CONFIGURED_MESSAGE,
  );

  useEffect(() => {
    if (!configured) {
      return;
    }

    let active = true;
    const supabase = getSupabaseClient();

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;

      if (sessionError) {
        setError(sessionError.message);
      }
      setSession(data.session ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;

      setSession(nextSession);
      setError("");
      setLoading(false);
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
      async signIn(email: string, password: string) {
        if (!configured) {
          throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
        }

        const supabase = getSupabaseClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          throw new Error(getAuthErrorMessage(signInError));
        }
      },
      async signUp(input: SignUpInput) {
        if (!configured) {
          throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
        }

        const supabase = getSupabaseClient();
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            data: input.name?.trim() ? { name: input.name.trim() } : undefined,
          },
        });

        if (signUpError) {
          throw new Error(getAuthErrorMessage(signUpError));
        }

        return { session: data.session ?? null };
      },
      async signOut() {
        if (!configured) {
          return;
        }

        const supabase = getSupabaseClient();
        const { error: signOutError } = await supabase.auth.signOut();

        if (signOutError) {
          throw new Error(getAuthErrorMessage(signOutError));
        }
      },
    }),
    [configured, error, loading, session],
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
