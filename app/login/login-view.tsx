"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { FeedbackMessage } from "@/app/_components/ui";
import { useAuth } from "@/app/_lib/auth-context";

type AuthMode = "login" | "signup";

type Notice = {
  tone: "success" | "warning" | "danger" | "neutral";
  text: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel concluir a operacao.";
}

export function LoginView() {
  const router = useRouter();
  const { configured, error: authError, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(
    authError ? { tone: "warning", text: authError } : null,
  );

  const isSignup = mode === "signup";

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setNotice(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanEmail = email.trim();
    const cleanName = name.trim();

    if (!cleanEmail) {
      setNotice({ tone: "warning", text: "Informe o e-mail." });
      return;
    }

    if (!password) {
      setNotice({ tone: "warning", text: "Informe a senha." });
      return;
    }

    if (isSignup && password !== confirmPassword) {
      setNotice({
        tone: "danger",
        text: "A confirmação de senha precisa ser igual à senha.",
      });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      if (isSignup) {
        const result = await signUp({
          name: cleanName || undefined,
          email: cleanEmail,
          password,
        });

        if (result.session) {
          router.replace("/dashboard");
          return;
        }

        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setNotice({
          tone: "success",
          text: "Conta criada. Faça login para continuar.",
        });
        return;
      }

      await signIn(cleanEmail, password);
      router.replace("/dashboard");
    } catch (error) {
      setNotice({ tone: "danger", text: getErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f7fb] px-4 py-8 text-slate-950">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-lg bg-slate-950 text-sm font-semibold text-white">
            SD
          </div>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">
            Sistema de Despacho
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">
            {isSignup ? "Criar conta" : "Entrar"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Acesse para continuar a operação de despacho.
          </p>
        </div>

        {notice ? (
          <div className="mb-4">
            <FeedbackMessage tone={notice.tone}>{notice.text}</FeedbackMessage>
          </div>
        ) : null}

        {!configured ? (
          <div className="mb-4">
            <FeedbackMessage tone="warning">
              Configure o Supabase no .env.local antes de usar login e senha.
            </FeedbackMessage>
          </div>
        ) : null}

        <form className="grid gap-4" onSubmit={handleSubmit}>
          {isSignup ? (
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Nome
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                placeholder="Seu nome"
                autoComplete="name"
              />
            </label>
          ) : null}

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            E-mail
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              placeholder="email@empresa.com"
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Senha
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              placeholder="Sua senha"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
            />
          </label>

          {isSignup ? (
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Confirmar senha
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                placeholder="Repita a senha"
                type="password"
                autoComplete="new-password"
                required
              />
            </label>
          ) : null}

          <button
            type="submit"
            disabled={!configured || submitting}
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting
              ? isSignup
                ? "Criando..."
                : "Entrando..."
              : isSignup
                ? "Criar conta"
                : "Entrar"}
          </button>
        </form>

        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5">
          {isSignup ? (
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
            >
              Já tenho conta
            </button>
          ) : (
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-teal-200 bg-teal-50 px-4 text-sm font-semibold text-teal-800 transition hover:border-teal-300 hover:bg-teal-100"
            >
              Criar conta
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
