"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { FeedbackMessage } from "@/app/_components/ui";
import { useAuth } from "@/app/_lib/auth-context";

type AuthMode = "login" | "signup" | "reset" | "new-password";
type Notice = {
  tone: "success" | "warning" | "danger" | "neutral";
  text: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Nao foi possivel concluir a operacao.";
}

export function LoginView() {
  const router = useRouter();
  const {
    configured,
    error: authError,
    passwordRecovery,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(
    authError ? { tone: "warning", text: authError } : null,
  );

  const activeMode: AuthMode = passwordRecovery ? "new-password" : mode;
  const needsPassword = activeMode !== "reset";
  const needsConfirmation =
    activeMode === "signup" || activeMode === "new-password";

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setNotice(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim();

    if (activeMode !== "new-password" && !cleanEmail) {
      setNotice({ tone: "warning", text: "Informe o e-mail." });
      return;
    }

    if (needsPassword && password.length < 6) {
      setNotice({ tone: "warning", text: "A senha deve ter ao menos 6 caracteres." });
      return;
    }

    if (needsConfirmation && password !== confirmPassword) {
      setNotice({ tone: "danger", text: "A confirmacao deve ser igual a senha." });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      if (activeMode === "signup") {
        const result = await signUp({
          name: name.trim() || undefined,
          email: cleanEmail,
          password,
        });

        if (result.session) {
          router.replace("/dashboard");
          return;
        }

        switchMode("login");
        setNotice({
          tone: "success",
          text: "Conta criada. Confirme o e-mail, se solicitado, e entre para continuar.",
        });
        return;
      }

      if (activeMode === "reset") {
        await requestPasswordReset(cleanEmail);
        setNotice({
          tone: "success",
          text: "Enviamos o link de recuperacao, caso o e-mail esteja cadastrado.",
        });
        return;
      }

      if (activeMode === "new-password") {
        await updatePassword(password);
        router.replace("/dashboard");
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

  const title =
    activeMode === "signup"
      ? "Criar conta"
      : activeMode === "reset"
        ? "Recuperar senha"
        : activeMode === "new-password"
          ? "Definir nova senha"
          : "Entrar";

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f7fb] px-4 py-8 text-slate-950">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-lg bg-slate-950 text-sm font-semibold text-white">SD</div>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Sistema de Despacho</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Cada conta acessa exclusivamente os proprios dados operacionais.
          </p>
        </div>

        {notice ? <div className="mb-4"><FeedbackMessage tone={notice.tone}>{notice.text}</FeedbackMessage></div> : null}
        {!configured ? (
          <div className="mb-4"><FeedbackMessage tone="warning">Configure o Supabase no .env.local antes de usar login e senha.</FeedbackMessage></div>
        ) : null}

        <form className="grid gap-4" onSubmit={handleSubmit}>
          {activeMode === "signup" ? (
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Nome
              <input value={name} onChange={(event) => setName(event.target.value)} className="min-h-11 rounded-md border border-slate-300 px-3 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" placeholder="Seu nome" autoComplete="name" />
            </label>
          ) : null}

          {activeMode !== "new-password" ? (
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              E-mail
              <input value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11 rounded-md border border-slate-300 px-3 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" placeholder="email@empresa.com" type="email" autoComplete="email" required />
            </label>
          ) : null}

          {needsPassword ? (
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Senha
              <input value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-11 rounded-md border border-slate-300 px-3 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" placeholder="Minimo de 6 caracteres" type="password" autoComplete={activeMode === "login" ? "current-password" : "new-password"} required />
            </label>
          ) : null}

          {needsConfirmation ? (
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Confirmar senha
              <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="min-h-11 rounded-md border border-slate-300 px-3 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" placeholder="Repita a senha" type="password" autoComplete="new-password" required />
            </label>
          ) : null}

          <button type="submit" disabled={!configured || submitting} className="inline-flex min-h-12 items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
            {submitting ? "Aguarde..." : title}
          </button>
        </form>

        {activeMode !== "new-password" ? (
          <div className="mt-5 grid gap-2 border-t border-slate-100 pt-5">
            {activeMode !== "login" ? (
              <button type="button" onClick={() => switchMode("login")} className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700">Ja tenho conta</button>
            ) : (
              <>
                <button type="button" onClick={() => switchMode("signup")} className="min-h-11 rounded-md border border-teal-200 bg-teal-50 px-4 text-sm font-semibold text-teal-800">Criar conta</button>
                <button type="button" onClick={() => switchMode("reset")} className="min-h-11 px-4 text-sm font-semibold text-slate-600">Recuperar senha</button>
              </>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
