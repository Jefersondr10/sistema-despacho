"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Badge, ConfirmDialog, EmptyState, FeedbackMessage } from "@/app/_components/ui";
import { useAuth } from "@/app/_lib/auth-context";
import { useFeedbackAdminAccess } from "@/app/_lib/feedback-admin-access";
import { useAccessibleFullscreenDialog } from "@/app/bipagem/use-accessible-fullscreen-dialog";
import {
  createFeedbackNotificationRecipient,
  deleteFeedbackNotificationRecipient,
  formatDatabaseError,
  listFeedbackNotificationRecipients,
  updateFeedbackNotificationRecipient,
  type FeedbackNotificationRecipient,
} from "@/lib/database";

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; recipient: FeedbackNotificationRecipient };

type Draft = {
  label: string;
  email: string;
  active: boolean;
};

const emptyDraft: Draft = { label: "", email: "", active: true };

function isValidEmail(value: string) {
  const normalized = value.trim();
  const at = normalized.indexOf("@");

  return (
    normalized.length >= 3 &&
    normalized.length <= 320 &&
    !/\s/.test(normalized) &&
    at > 0 &&
    at === normalized.lastIndexOf("@") &&
    at < normalized.length - 1
  );
}

function recipientErrorMessage(error: unknown) {
  const message = formatDatabaseError(error);
  const normalized = message.toLocaleLowerCase("pt-BR");

  if (
    normalized.includes("23505") ||
    normalized.includes("duplicate") ||
    normalized.includes("unique") ||
    normalized.includes("este cadastro ja existe") ||
    normalized.includes("já está cadastrado")
  ) {
    return "Este e-mail já está cadastrado.";
  }

  if (
    normalized.includes("feedback_recipient_conflict") ||
    normalized.includes("alterado em outra tela")
  ) {
    return "Este destinatário foi alterado em outra tela. Atualize a lista e tente novamente.";
  }

  if (normalized.includes("feedback_recipient_active_limit")) {
    return "O limite de 50 destinatários ativos foi atingido.";
  }

  return message;
}

function initialDraft(editor: EditorState): Draft {
  if (editor.mode === "create") return emptyDraft;

  return {
    label: editor.recipient.label ?? "",
    email: editor.recipient.email,
    active: editor.recipient.active,
  };
}

function RecipientEditor({
  editor,
  onClose,
  onSaved,
}: {
  editor: EditorState;
  onClose: () => void;
  onSaved: (recipient: FeedbackNotificationRecipient) => void;
}) {
  const { session, user } = useAuth();
  const dialogRef = useRef<HTMLElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const original = useMemo(() => initialDraft(editor), [editor]);
  const [draft, setDraft] = useState<Draft>(original);
  const [emailError, setEmailError] = useState("");
  const [labelError, setLabelError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty =
    draft.label !== original.label ||
    draft.email !== original.email ||
    draft.active !== original.active;

  const requestClose = useCallback(() => {
    if (
      savingRef.current ||
      (dirty && !window.confirm("Descartar as alterações ainda não salvas?"))
    ) {
      return;
    }
    onClose();
  }, [dirty, onClose]);

  useAccessibleFullscreenDialog({
    open: true,
    dialogRef,
    initialFocusRef: emailRef,
    onClose: requestClose,
  });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;

    const email = draft.email.trim().toLocaleLowerCase("pt-BR");
    const label = draft.label.trim();
    const nextEmailError = isValidEmail(email)
      ? ""
      : "Informe um e-mail válido.";
    const nextLabelError = Array.from(label).length <= 120
      ? ""
      : "O nome deve ter no máximo 120 caracteres.";

    setEmailError(nextEmailError);
    setLabelError(nextLabelError);
    setNotice("");
    if (nextEmailError || nextLabelError) {
      if (nextEmailError) emailRef.current?.focus();
      return;
    }

    const context = {
      userId: user?.id,
      accessToken: session?.access_token,
    };
    savingRef.current = true;
    setSaving(true);

    try {
      const recipient =
        editor.mode === "create"
          ? await createFeedbackNotificationRecipient(
              { email, label: label || null, active: draft.active },
              context,
            )
          : await updateFeedbackNotificationRecipient(
              editor.recipient.id,
              { email, label: label || null, active: draft.active },
              editor.recipient.updated_at,
              context,
            );
      onSaved(recipient);
    } catch (error) {
      setNotice(recipientErrorMessage(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-0 backdrop-blur-sm sm:grid sm:place-items-center sm:p-5">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-recipient-editor-title"
        className="min-h-dvh w-full bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] outline-none sm:min-h-0 sm:max-w-xl sm:rounded-3xl sm:border sm:border-white/90 sm:p-6 sm:shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">
              Notificações de feedback
            </p>
            <h2
              id="feedback-recipient-editor-title"
              className="mt-1 text-xl font-bold text-slate-950"
            >
              {editor.mode === "create"
                ? "Adicionar destinatário"
                : "Editar destinatário"}
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            aria-label="Fechar cadastro de destinatário"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-xl font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <form onSubmit={save} className="mt-5 grid gap-4">
          {notice ? (
            <FeedbackMessage tone="danger">{notice}</FeedbackMessage>
          ) : null}

          <label className="grid gap-1.5 text-sm font-bold text-slate-800">
            E-mail
            <input
              ref={emailRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={320}
              required
              value={draft.email}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  email: event.target.value,
                }));
                setEmailError("");
              }}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? "recipient-email-error" : undefined}
              className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-base font-medium text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              placeholder="gestao@empresa.com.br"
            />
            {emailError ? (
              <span id="recipient-email-error" className="text-sm text-rose-700" role="alert">
                {emailError}
              </span>
            ) : null}
          </label>

          <label className="grid gap-1.5 text-sm font-bold text-slate-800">
            Nome ou identificação <span className="font-medium text-slate-500">(opcional)</span>
            <input
              type="text"
              maxLength={120}
              value={draft.label}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  label: event.target.value,
                }));
                setLabelError("");
              }}
              aria-invalid={Boolean(labelError)}
              aria-describedby={labelError ? "recipient-label-error" : undefined}
              className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-base font-medium text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              placeholder="Ex.: Gerência de operações"
            />
            {labelError ? (
              <span id="recipient-label-error" className="text-sm text-rose-700" role="alert">
                {labelError}
              </span>
            ) : null}
          </label>

          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-800">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  active: event.target.checked,
                }))
              }
              className="size-5 accent-teal-700"
            />
            Receber novos feedbacks por e-mail
          </label>

          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-teal-700 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {saving ? "Salvando..." : "Salvar destinatário"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function FeedbackNotificationRecipientsManager() {
  const { session, user } = useAuth();
  const { status: adminAccessStatus, refresh: refreshAdminAccess } =
    useFeedbackAdminAccess();
  const requestRef = useRef(0);
  const [items, setItems] = useState<FeedbackNotificationRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<FeedbackNotificationRecipient | null>(null);
  const [mutatingId, setMutatingId] = useState("");
  const isAdmin = adminAccessStatus === "allowed";
  const context = useMemo(
    () => ({ userId: user?.id, accessToken: session?.access_token }),
    [session?.access_token, user?.id],
  );

  const load = useCallback(async () => {
    if (!isAdmin || !context.userId || !context.accessToken) return;

    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const recipients = await listFeedbackNotificationRecipients(context);
      if (requestId !== requestRef.current) return;
      setItems(recipients);
    } catch (loadError) {
      if (requestId !== requestRef.current) return;
      setError(recipientErrorMessage(loadError));
      void refreshAdminAccess();
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [context, isAdmin, refreshAdminAccess]);

  useEffect(() => {
    if (!isAdmin) {
      requestRef.current += 1;
      queueMicrotask(() => {
        setItems([]);
        setEditor(null);
        setDeleteTarget(null);
      });
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, load]);

  async function toggleRecipient(recipient: FeedbackNotificationRecipient) {
    if (mutatingId) return;
    setMutatingId(recipient.id);
    setNotice("");
    setError("");
    try {
      const updated = await updateFeedbackNotificationRecipient(
        recipient.id,
        {
          email: recipient.email,
          label: recipient.label,
          active: !recipient.active,
        },
        recipient.updated_at,
        context,
      );
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(
        updated.active
          ? `${updated.email} foi ativado.`
          : `${updated.email} foi desativado.`,
      );
    } catch (updateError) {
      setError(recipientErrorMessage(updateError));
      void load();
    } finally {
      setMutatingId("");
    }
  }

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target || mutatingId) return;

    setMutatingId(target.id);
    setDeleteTarget(null);
    setNotice("");
    setError("");
    try {
      await deleteFeedbackNotificationRecipient(
        target.id,
        target.updated_at,
        context,
      );
      setItems((current) => current.filter((item) => item.id !== target.id));
      setNotice(`${target.email} foi excluído.`);
    } catch (deleteError) {
      setError(recipientErrorMessage(deleteError));
      void load();
    } finally {
      setMutatingId("");
    }
  }

  function recipientSaved(recipient: FeedbackNotificationRecipient) {
    setItems((current) => {
      const exists = current.some((item) => item.id === recipient.id);
      return exists
        ? current.map((item) => (item.id === recipient.id ? recipient : item))
        : [recipient, ...current];
    });
    setEditor(null);
    setNotice(`${recipient.email} foi salvo.`);
    setError("");
    void load();
  }

  if (!isAdmin) return null;

  const activeCount = items.filter((item) => item.active).length;

  return (
    <section
      className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
      aria-labelledby="feedback-notification-recipients-title"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">
            Configuração gerencial
          </p>
          <h2
            id="feedback-notification-recipients-title"
            className="mt-1 text-xl font-bold text-slate-950"
          >
            Destinatários das notificações
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Somente os e-mails ativos abaixo recebem uma mensagem quando um novo feedback é enviado.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditor({ mode: "create" })}
          className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          Adicionar destinatário
        </button>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Resumo dos destinatários">
        <Badge tone={activeCount ? "green" : "amber"}>{activeCount} ativos</Badge>
        <Badge>{items.length} cadastrados</Badge>
      </div>

      {!loading && activeCount === 0 ? (
        <FeedbackMessage tone="warning">
          Nenhum destinatário está ativo. Os feedbacks continuarão sendo salvos, mas não haverá aviso por e-mail.
        </FeedbackMessage>
      ) : null}
      {notice ? <FeedbackMessage tone="success">{notice}</FeedbackMessage> : null}
      {error ? <FeedbackMessage tone="danger">{error}</FeedbackMessage> : null}

      {loading && !items.length ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-600" role="status">
          Carregando destinatários...
        </div>
      ) : null}

      {!loading && !items.length ? (
        <EmptyState>
          Nenhum e-mail cadastrado. Use “Adicionar destinatário” para começar a receber os novos feedbacks.
        </EmptyState>
      ) : null}

      {items.length ? (
        <div className="grid gap-3">
          {items.map((recipient) => {
            const busy = mutatingId === recipient.id;
            return (
              <article
                key={recipient.id}
                className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words font-bold text-slate-950">
                      {recipient.label || "Sem identificação"}
                    </h3>
                    <Badge tone={recipient.active ? "green" : "neutral"}>
                      {recipient.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <p className="mt-1 break-all text-sm font-medium text-slate-700">
                    {recipient.email}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:justify-end">
                  <button
                    type="button"
                    onClick={() => setEditor({ mode: "edit", recipient })}
                    disabled={busy || Boolean(mutatingId)}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-teal-300 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleRecipient(recipient)}
                    disabled={busy || Boolean(mutatingId)}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-amber-300 hover:text-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? "Aguarde..." : recipient.active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(recipient)}
                    disabled={busy || Boolean(mutatingId)}
                    className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-xl border border-rose-200 bg-white px-3 text-sm font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-1"
                  >
                    Excluir
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        className="inline-flex min-h-11 w-fit items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-teal-300 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Atualizando..." : "Atualizar lista"}
      </button>

      {editor ? (
        <RecipientEditor
          key={editor.mode === "create" ? "new" : editor.recipient.id}
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={recipientSaved}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir destinatário?"
        message={
          <>
            O e-mail <strong className="break-all">{deleteTarget?.email}</strong> deixará de receber notificações e será removido do cadastro.
          </>
        }
        cancelLabel="Manter cadastro"
        confirmLabel="Excluir definitivamente"
        tone="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
}
