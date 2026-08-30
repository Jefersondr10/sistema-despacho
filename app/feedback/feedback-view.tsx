"use client";

import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { EmptyState, FeedbackMessage } from "@/app/_components/ui";
import { useAuth } from "@/app/_lib/auth-context";
import { useFeedbackAdminAccess } from "@/app/_lib/feedback-admin-access";
import { useAccessibleFullscreenDialog } from "@/app/bipagem/use-accessible-fullscreen-dialog";
import {
  formatDatabaseError,
  getFeedbackManagementSummary,
  getFeedbacksForManagement,
  getOwnFeedbackPage,
  type FeedbackArea,
  type FeedbackCategory,
  type FeedbackManagementSummary,
  type FeedbackRow,
  type FeedbackStatus,
} from "@/lib/database";

type ActiveTab = "submit" | "mine" | "manage";
type FeedbackViewMode = "user" | "management";
type NoticeTone = "success" | "warning" | "danger" | "neutral";
type Notice = { tone: NoticeTone; text: string };

type FeedbackApiResult = {
  ok?: boolean;
  feedback?: FeedbackRow;
  notificationSent?: boolean;
  message?: string;
};

type FormErrors = Partial<
  Record<"category" | "area" | "subject" | "message", string>
>;

const categoryOptions: ReadonlyArray<{
  value: FeedbackCategory;
  label: string;
}> = [
  { value: "sugestao", label: "Sugestão" },
  { value: "reclamacao", label: "Reclamação" },
  { value: "problema", label: "Problema" },
  { value: "duvida", label: "Dúvida" },
  { value: "elogio", label: "Elogio" },
];

const areaOptions: ReadonlyArray<{ value: FeedbackArea; label: string }> = [
  { value: "bipagem", label: "Bipagem" },
  { value: "pacotes", label: "Pacotes" },
  { value: "relatorios", label: "Relatórios" },
  { value: "cadastros", label: "Cadastros" },
  { value: "geral", label: "Sistema em geral" },
];

const statusOptions: ReadonlyArray<{
  value: FeedbackStatus;
  label: string;
}> = [
  { value: "novo", label: "Novo" },
  { value: "em_analise", label: "Em análise" },
  { value: "respondido", label: "Respondido" },
  { value: "resolvido", label: "Resolvido" },
  { value: "arquivado", label: "Arquivado" },
];

const FEEDBACK_PAGE_SIZE = 10;
const MOBILE_MANAGEMENT_QUERY = "(max-width: 1279px)";

const emptyManagementSummary: FeedbackManagementSummary = {
  total: 0,
  novos: 0,
  emAnalise: 0,
  respondidos: 0,
  resolvidos: 0,
  arquivados: 0,
};

function optionLabel<T extends string>(
  options: ReadonlyArray<{ value: T; label: string }>,
  value: T,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Data não informada";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatProtocol(id: string) {
  return `FB-${id.replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

function textLength(value: string) {
  return Array.from(value).length;
}

function createSubmissionId() {
  if (typeof crypto !== "undefined") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hexadecimal = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}`;
}

function subscribeMobileManagementViewport(onChange: () => void) {
  const mediaQuery = window.matchMedia(MOBILE_MANAGEMENT_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getMobileManagementSnapshot() {
  return window.matchMedia(MOBILE_MANAGEMENT_QUERY).matches;
}

function getServerMobileManagementSnapshot() {
  return false;
}

function useMobileManagementViewport() {
  return useSyncExternalStore(
    subscribeMobileManagementViewport,
    getMobileManagementSnapshot,
    getServerMobileManagementSnapshot,
  );
}

function StatusPill({ status }: { status: FeedbackStatus }) {
  const classes: Record<FeedbackStatus, string> = {
    novo: "border-sky-200 bg-sky-50 text-sky-700",
    em_analise: "border-amber-200 bg-amber-50 text-amber-800",
    respondido: "border-violet-200 bg-violet-50 text-violet-700",
    resolvido: "border-emerald-200 bg-emerald-50 text-emerald-700",
    arquivado: "border-slate-200 bg-slate-100 text-slate-600",
  };

  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-xs font-bold ${classes[status]}`}
    >
      {optionLabel(statusOptions, status)}
    </span>
  );
}

function CategoryPill({ category }: { category: FeedbackCategory }) {
  return (
    <span className="inline-flex min-h-7 items-center rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
      {optionLabel(categoryOptions, category)}
    </span>
  );
}

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;

  return (
    <span id={id} className="text-sm font-semibold text-rose-700" role="alert">
      {children}
    </span>
  );
}

function FeedbackHistory({
  items,
  loading,
  error,
  page,
  pageSize,
  total,
  onPageChange,
  onRefresh,
}: {
  items: FeedbackRow[];
  loading: boolean;
  error: string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Meus feedbacks</h2>
          <p className="mt-1 text-sm text-slate-500">
            {total
              ? `Exibindo ${start}–${end} de ${total}`
              : "Acompanhe aqui os feedbacks que você enviou."}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-teal-300 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {error ? (
        <FeedbackMessage tone="danger">{error}</FeedbackMessage>
      ) : null}

      {loading && !items.length ? (
        <div
          className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600 shadow-sm"
          role="status"
        >
          Carregando seus feedbacks...
        </div>
      ) : items.length ? (
        <div className="grid gap-4" aria-busy={loading}>
          {items.map((feedback) => (
            <article
              key={feedback.id}
              className="min-w-0 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm shadow-slate-900/5 sm:p-5"
            >
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CategoryPill category={feedback.category} />
                    <StatusPill status={feedback.status} />
                  </div>
                  <h3 className="mt-3 break-words text-base font-bold text-slate-950 sm:text-lg">
                    {feedback.subject}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {formatProtocol(feedback.id)} · {formatDate(feedback.created_at)}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-slate-500">
                  {optionLabel(areaOptions, feedback.area)}
                </span>
              </div>

              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                {feedback.message}
              </p>

              {feedback.admin_response ? (
                <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-teal-700">
                    Resposta da equipe
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-teal-950">
                    {feedback.admin_response}
                  </p>
                  {feedback.reviewed_at ? (
                    <p className="mt-2 text-xs font-semibold text-teal-700">
                      Atualizado em {formatDate(feedback.reviewed_at)}
                    </p>
                  ) : null}
                </div>
              ) : feedback.status === "resolvido" ||
                feedback.status === "arquivado" ? (
                <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  Atendimento encerrado sem resposta registrada.
                </p>
              ) : (
                <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  Feedback encaminhado. O retorno será enviado ao e-mail da sua conta.
                </p>
              )}
            </article>
          ))}
        </div>
      ) : !error ? (
        <EmptyState>
          Você ainda não enviou nenhum feedback. Use a aba Enviar para registrar a
          primeira mensagem.
        </EmptyState>
      ) : null}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={loading || page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-teal-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            Anterior
          </button>
          <span className="text-sm font-semibold text-slate-600">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={loading || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-teal-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            Próxima
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SubmitFeedbackForm({
  onCreated,
}: {
  onCreated: (feedback: FeedbackRow) => void;
}) {
  const { session } = useAuth();
  const submittingRef = useRef(false);
  const submissionIdRef = useRef<string | null>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const areaRef = useRef<HTMLSelectElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const [category, setCategory] = useState<FeedbackCategory | "">("");
  const [area, setArea] = useState<FeedbackArea | "">("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  function markFormChanged() {
    submissionIdRef.current = null;
    setNotice(null);
  }

  function validate() {
    const nextErrors: FormErrors = {};
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();
    const trimmedSubjectLength = textLength(trimmedSubject);
    const trimmedMessageLength = textLength(trimmedMessage);

    if (!category) nextErrors.category = "Escolha o tipo de feedback.";
    if (!area) nextErrors.area = "Escolha a área do sistema.";
    if (trimmedSubjectLength < 3 || trimmedSubjectLength > 120) {
      nextErrors.subject = "O assunto deve ter entre 3 e 120 caracteres.";
    }
    if (trimmedMessageLength < 20 || trimmedMessageLength > 4000) {
      nextErrors.message = "A mensagem deve ter entre 20 e 4.000 caracteres.";
    }

    setErrors(nextErrors);
    return {
      valid: Object.keys(nextErrors).length === 0,
      trimmedSubject,
      trimmedMessage,
    };
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current) return;

    setNotice(null);
    const validation = validate();
    if (!validation.valid || !category || !area) {
      const firstInvalidField = !category
        ? categoryRef.current
        : !area
          ? areaRef.current
          : textLength(subject.trim()) < 3 || textLength(subject.trim()) > 120
            ? subjectRef.current
            : messageRef.current;
      window.requestAnimationFrame(() => firstInvalidField?.focus());
      return;
    }

    if (!session?.access_token) {
      setNotice({
        tone: "danger",
        text: "Sua sessão expirou. Entre novamente antes de enviar.",
      });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    const submissionId = submissionIdRef.current ?? createSubmissionId();
    submissionIdRef.current = submissionId;

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          submissionId,
          category,
          area,
          subject: validation.trimmedSubject,
          message: validation.trimmedMessage,
          pagePath:
            typeof window === "undefined" ? "/feedback" : window.location.pathname,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | FeedbackApiResult
        | null;

      if (!response.ok || !result?.ok || !result.feedback) {
        throw new Error(
          result?.message || "Não foi possível enviar o feedback agora.",
        );
      }

      onCreated(result.feedback);
      setCategory("");
      setArea("");
      setSubject("");
      setMessage("");
      setErrors({});
      submissionIdRef.current = null;
      setNotice({
        tone: result.notificationSent === false ? "warning" : "success",
        text: `${result.message || "Feedback enviado com sucesso."} Protocolo: ${formatProtocol(result.feedback.id)}.`,
      });
    } catch (submitError) {
      setNotice({
        tone: "danger",
        text: formatDatabaseError(submitError),
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const fieldClass =
    "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100";
  const subjectLength = textLength(subject);
  const messageLength = textLength(message);

  return (
    <form
      noValidate
      onSubmit={submitFeedback}
      className="grid gap-5 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm shadow-slate-900/5 sm:p-6"
    >
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-slate-950">Conte para a gente</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Quanto mais detalhes você enviar, mais fácil será entender e resolver.
        </p>
      </div>

      {notice ? (
        <FeedbackMessage tone={notice.tone}>{notice.text}</FeedbackMessage>
      ) : null}

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="grid min-w-0 gap-1.5" htmlFor="feedback-category">
          <span className="text-sm font-bold text-slate-700">Tipo</span>
          <select
            ref={categoryRef}
            id="feedback-category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as FeedbackCategory | "");
              setErrors((current) => ({ ...current, category: undefined }));
              markFormChanged();
            }}
            disabled={submitting}
            aria-invalid={Boolean(errors.category)}
            aria-describedby={errors.category ? "feedback-category-error" : undefined}
            className={fieldClass}
          >
            <option value="">Selecione</option>
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <FieldError id="feedback-category-error">{errors.category}</FieldError>
        </label>

        <label className="grid min-w-0 gap-1.5" htmlFor="feedback-area">
          <span className="text-sm font-bold text-slate-700">Área do sistema</span>
          <select
            ref={areaRef}
            id="feedback-area"
            value={area}
            onChange={(event) => {
              setArea(event.target.value as FeedbackArea | "");
              setErrors((current) => ({ ...current, area: undefined }));
              markFormChanged();
            }}
            disabled={submitting}
            aria-invalid={Boolean(errors.area)}
            aria-describedby={errors.area ? "feedback-area-error" : undefined}
            className={fieldClass}
          >
            <option value="">Selecione</option>
            {areaOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <FieldError id="feedback-area-error">{errors.area}</FieldError>
        </label>
      </div>

      <label className="grid min-w-0 gap-1.5" htmlFor="feedback-subject">
        <span className="text-sm font-bold text-slate-700">Assunto</span>
        <input
          ref={subjectRef}
          id="feedback-subject"
          type="text"
          value={subject}
          minLength={3}
          onChange={(event) => {
            setSubject(event.target.value);
            setErrors((current) => ({ ...current, subject: undefined }));
            markFormChanged();
          }}
          disabled={submitting}
          aria-invalid={Boolean(errors.subject)}
          aria-describedby={errors.subject ? "feedback-subject-error" : undefined}
          className={fieldClass}
          placeholder="Resuma o que você quer contar"
        />
        <div className="flex flex-wrap justify-between gap-2">
          <FieldError id="feedback-subject-error">{errors.subject}</FieldError>
          <span className="ml-auto text-xs font-semibold text-slate-500">
            {subjectLength}/120
          </span>
        </div>
      </label>

      <label className="grid min-w-0 gap-1.5" htmlFor="feedback-message">
        <span className="text-sm font-bold text-slate-700">Mensagem</span>
        <textarea
          ref={messageRef}
          id="feedback-message"
          value={message}
          minLength={20}
          rows={8}
          onChange={(event) => {
            setMessage(event.target.value);
            setErrors((current) => ({ ...current, message: undefined }));
            markFormChanged();
          }}
          disabled={submitting}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? "feedback-message-error" : undefined}
          className={`${fieldClass} min-h-40 resize-y py-3 leading-6`}
          placeholder="Explique o que aconteceu, o que esperava e como podemos melhorar."
        />
        <div className="flex flex-wrap justify-between gap-2">
          <FieldError id="feedback-message-error">{errors.message}</FieldError>
          <span className="ml-auto text-xs font-semibold text-slate-500">
            {messageLength}/4.000
          </span>
        </div>
      </label>

      <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-slate-500">
          Sua conta, data e página atual serão registradas para facilitar o
          atendimento.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-teal-700 px-5 text-sm font-bold text-white shadow-lg shadow-teal-900/15 transition hover:-translate-y-0.5 hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          {submitting ? "Enviando..." : "Enviar feedback"}
        </button>
      </div>
    </form>
  );
}

function ManagementEditor({
  feedback,
  accessToken,
  onSaved,
  dirtyRef,
  editorSavingRef,
  closeButtonRef,
  onRequestClose,
  externalVersionWarning,
  latestExternalFeedback,
  onRefresh,
  onAdoptLatestVersion,
}: {
  feedback: FeedbackRow;
  accessToken: string;
  onSaved: (feedback: FeedbackRow) => void;
  dirtyRef: { current: boolean };
  editorSavingRef: { current: boolean };
  closeButtonRef: { current: HTMLButtonElement | null };
  onRequestClose: () => void;
  externalVersionWarning: string;
  latestExternalFeedback: FeedbackRow | null;
  onRefresh: () => void;
  onAdoptLatestVersion: (feedback: FeedbackRow) => void;
}) {
  const savingRef = useRef(false);
  const responseRef = useRef<HTMLTextAreaElement>(null);
  const [baseline, setBaseline] = useState(() => ({
    status: feedback.status,
    response: feedback.admin_response ?? "",
    updatedAt: feedback.updated_at,
  }));
  const [status, setStatus] = useState<FeedbackStatus>(feedback.status);
  const [response, setResponse] = useState(feedback.admin_response ?? "");
  const [saving, setSaving] = useState(false);
  const [retryingEmail, setRetryingEmail] = useState(false);
  const [canRetryEmail, setCanRetryEmail] = useState(false);
  const [conflictDetected, setConflictDetected] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [responseError, setResponseError] = useState("");
  const dirty =
    status !== baseline.status || response !== baseline.response;
  const responseLength = textLength(response);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty, dirtyRef]);

  useEffect(() => {
    if (
      dirty ||
      feedback.updated_at === baseline.updatedAt ||
      feedback.updated_at < baseline.updatedAt
    ) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const nextResponse = feedback.admin_response ?? "";
      setBaseline({
        status: feedback.status,
        response: nextResponse,
        updatedAt: feedback.updated_at,
      });
      setStatus(feedback.status);
      setResponse(nextResponse);
      setConflictDetected(false);
    });

    return () => {
      cancelled = true;
    };
  }, [baseline.updatedAt, dirty, feedback]);

  function validateResponse(value: string, nextStatus: FeedbackStatus) {
    const trimmedResponseLength = textLength(value.trim());

    if (nextStatus === "respondido" && trimmedResponseLength < 3) {
      setResponseError(
        "Escreva ao menos 3 caracteres para marcar como respondido.",
      );
      window.requestAnimationFrame(() => responseRef.current?.focus());
      return false;
    }

    if (trimmedResponseLength > 4000) {
      setResponseError("A resposta deve ter no máximo 4.000 caracteres.");
      window.requestAnimationFrame(() => responseRef.current?.focus());
      return false;
    }

    return true;
  }

  async function updateFeedback(mode: "save" | "retry-email") {
    if (savingRef.current) return;

    const isEmailRetry = mode === "retry-email";
    const requestStatus = isEmailRetry ? baseline.status : status;
    const requestResponse = isEmailRetry ? baseline.response : response;
    if (!validateResponse(requestResponse, requestStatus)) return;

    savingRef.current = true;
    editorSavingRef.current = true;
    setSaving(true);
    setRetryingEmail(isEmailRetry);
    setNotice(null);
    setResponseError("");

    try {
      const request = await fetch(`/api/feedback/${feedback.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          status: requestStatus,
          response: requestResponse.trim(),
          expectedUpdatedAt: baseline.updatedAt,
        }),
      });
      const result = (await request.json().catch(() => null)) as
        | FeedbackApiResult
        | null;

      if (request.status === 409) {
        setConflictDetected(true);
        setNotice({
          tone: "warning",
          text: `${result?.message?.trim() || "Este feedback foi atualizado em outra tela."} Seu rascunho foi preservado. Atualize a lista abaixo para continuar.`,
        });
        return;
      }

      if (!request.ok || !result?.ok || !result.feedback) {
        throw new Error(result?.message || "Não foi possível salvar a resposta.");
      }

      const nextResponse = result.feedback.admin_response ?? "";
      setBaseline({
        status: result.feedback.status,
        response: nextResponse,
        updatedAt: result.feedback.updated_at,
      });
      if (!isEmailRetry) {
        setStatus(result.feedback.status);
        setResponse(nextResponse);
        dirtyRef.current = false;
      }
      setConflictDetected(false);
      setCanRetryEmail(result.notificationSent === false);
      onSaved(result.feedback);
      setNotice({
        tone: result.notificationSent === false ? "warning" : "success",
        text:
          result.notificationSent === false
            ? result.message ||
              "Alteração salva, mas o e-mail de resposta não foi enviado."
            : result.message ||
              (result.notificationSent === true
                ? "Feedback atualizado e usuário notificado."
                : "Feedback atualizado."),
      });
    } catch (saveError) {
      setNotice({ tone: "danger", text: formatDatabaseError(saveError) });
    } finally {
      savingRef.current = false;
      editorSavingRef.current = false;
      setSaving(false);
      setRetryingEmail(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void updateFeedback("save");
  }

  function retryEmail() {
    void updateFeedback("retry-email");
  }

  function adoptLatestVersion() {
    if (!latestExternalFeedback) return;

    setBaseline({
      status: latestExternalFeedback.status,
      response: latestExternalFeedback.admin_response ?? "",
      updatedAt: latestExternalFeedback.updated_at,
    });
    setConflictDetected(false);
    onAdoptLatestVersion(latestExternalFeedback);
    setNotice({
      tone: "neutral",
      text: "Versão mais recente adotada. Seu status e sua resposta locais foram mantidos; revise e salve novamente.",
    });
  }

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <CategoryPill category={feedback.category} />
            <StatusPill status={feedback.status} />
          </div>
          <h3
            id={`management-editor-title-${feedback.id}`}
            className="mt-3 break-words text-xl font-bold text-slate-950"
          >
            {feedback.subject}
          </h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {formatProtocol(feedback.id)} · {formatDate(feedback.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
          <span className="text-xs font-bold text-slate-500">
            {optionLabel(areaOptions, feedback.area)}
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onRequestClose}
            className="inline-flex size-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-xl font-semibold text-slate-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100 xl:hidden"
            aria-label="Fechar detalhes do feedback"
          >
            ×
          </button>
        </div>
      </div>

      <dl className="mt-5 grid min-w-0 gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
            Usuário
          </dt>
          <dd className="mt-1 break-all font-semibold text-slate-900">
            {feedback.sender_email || "E-mail não informado"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
            ID da conta
          </dt>
          <dd className="mt-1 break-all font-mono text-xs text-slate-700">
            {feedback.user_id}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
            Página de origem
          </dt>
          <dd className="mt-1 break-all text-slate-700">
            {feedback.page_path || "Não informada"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
            Última atualização
          </dt>
          <dd className="mt-1 text-slate-700">{formatDate(feedback.updated_at)}</dd>
        </div>
      </dl>

      <div className="mt-5">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
          Mensagem recebida
        </p>
        <p className="mt-2 whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-800">
          {feedback.message}
        </p>
      </div>

      <form onSubmit={save} className="mt-5 grid gap-4 border-t border-slate-100 pt-5">
        {externalVersionWarning ? (
          <FeedbackMessage tone="warning">
            {externalVersionWarning}
          </FeedbackMessage>
        ) : null}

        {notice ? (
          <FeedbackMessage tone={notice.tone}>{notice.text}</FeedbackMessage>
        ) : null}

        {externalVersionWarning || conflictDetected ? (
          <div className="grid gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={onRefresh}
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-300 bg-white px-4 text-sm font-bold text-amber-900 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Atualizar lista
            </button>
            {latestExternalFeedback &&
            latestExternalFeedback.updated_at !== baseline.updatedAt ? (
              <button
                type="button"
                onClick={adoptLatestVersion}
                disabled={saving}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-700 px-4 text-sm font-bold text-white transition hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Usar versão mais recente
              </button>
            ) : null}
          </div>
        ) : null}

        <label className="grid gap-1.5" htmlFor={`manage-status-${feedback.id}`}>
          <span className="text-sm font-bold text-slate-700">Status</span>
          <select
            id={`manage-status-${feedback.id}`}
            value={status}
            onChange={(event) => {
              const nextStatus = event.target.value as FeedbackStatus;
              setStatus(nextStatus);
              if (nextStatus !== "respondido") setResponseError("");
            }}
            disabled={saving}
            className="min-h-12 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:bg-slate-100"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5" htmlFor={`manage-response-${feedback.id}`}>
          <span className="text-sm font-bold text-slate-700">
            Resposta para o usuário
          </span>
          <textarea
            ref={responseRef}
            id={`manage-response-${feedback.id}`}
            value={response}
            rows={7}
            onChange={(event) => {
              setResponse(event.target.value);
              setResponseError("");
            }}
            disabled={saving}
            aria-invalid={Boolean(responseError)}
            aria-describedby={
              responseError ? `manage-response-error-${feedback.id}` : undefined
            }
            className="min-h-36 resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:bg-slate-100"
            placeholder="Escreva uma resposta clara. Ela ficará visível em Meus feedbacks."
          />
          <span className="flex flex-wrap justify-between gap-2">
            {responseError ? (
              <span
                id={`manage-response-error-${feedback.id}`}
                className="text-sm font-semibold text-rose-700"
                role="alert"
              >
                {responseError}
              </span>
            ) : null}
            <span className="ml-auto text-xs font-semibold text-slate-500">
              {responseLength}/4.000
            </span>
          </span>
        </label>

        <div className="grid gap-2 sm:justify-items-end">
          <p className="text-xs leading-5 text-slate-500 sm:text-right">
            Uma resposta nova ou alterada será enviada ao usuário por e-mail.
          </p>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-flow-col">
            {canRetryEmail ? (
              <button
                type="button"
                onClick={retryEmail}
                disabled={saving}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-5 text-sm font-bold text-amber-900 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {retryingEmail
                  ? "Tentando novamente..."
                  : "Tentar enviar e-mail novamente"}
              </button>
            ) : null}
            <button
              type="submit"
              disabled={saving || !dirty}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-teal-700 px-5 text-sm font-bold text-white shadow-lg shadow-teal-900/15 transition hover:-translate-y-0.5 hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {saving && !retryingEmail ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </div>
      </form>
    </article>
  );
}

function ManagementPanel({
  isAdmin,
  active,
  accessToken,
  items,
  total,
  page,
  pageSize,
  summary,
  loading,
  summaryLoading,
  error,
  summaryError,
  statusFilter,
  categoryFilter,
  areaFilter,
  searchInput,
  onStatusFilterChange,
  onCategoryFilterChange,
  onAreaFilterChange,
  onSearchInputChange,
  onPageChange,
  onRefresh,
  onSaved,
}: {
  isAdmin: boolean;
  active: boolean;
  accessToken: string;
  items: FeedbackRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: FeedbackManagementSummary;
  loading: boolean;
  summaryLoading: boolean;
  error: string;
  summaryError: string;
  statusFilter: FeedbackStatus | "";
  categoryFilter: FeedbackCategory | "";
  areaFilter: FeedbackArea | "";
  searchInput: string;
  onStatusFilterChange: (value: FeedbackStatus | "") => void;
  onCategoryFilterChange: (value: FeedbackCategory | "") => void;
  onAreaFilterChange: (value: FeedbackArea | "") => void;
  onSearchInputChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  onSaved: (feedback: FeedbackRow) => void;
}) {
  const [selectedFeedback, setSelectedFeedback] =
    useState<FeedbackRow | null>(null);
  const [externalVersionWarning, setExternalVersionWarning] = useState("");
  const [latestExternalFeedback, setLatestExternalFeedback] =
    useState<FeedbackRow | null>(null);
  const dirtyRef = useRef(false);
  const editorSavingRef = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mobileViewport = useMobileManagementViewport();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function confirmDiscardChanges() {
    if (editorSavingRef.current) {
      window.alert("Aguarde o salvamento terminar antes de fechar ou trocar.");
      return false;
    }

    return (
      !dirtyRef.current ||
      window.confirm("Descartar as alterações ainda não salvas?")
    );
  }

  function selectFeedback(feedback: FeedbackRow) {
    if (selectedFeedback?.id === feedback.id) return;
    if (!confirmDiscardChanges()) return;

    dirtyRef.current = false;
    setExternalVersionWarning("");
    setLatestExternalFeedback(null);
    setSelectedFeedback(feedback);
  }

  function closeEditor() {
    if (!confirmDiscardChanges()) return;

    dirtyRef.current = false;
    setExternalVersionWarning("");
    setLatestExternalFeedback(null);
    setSelectedFeedback(null);
  }

  function applySavedFeedback(feedback: FeedbackRow) {
    dirtyRef.current = false;
    setExternalVersionWarning("");
    setLatestExternalFeedback(null);
    setSelectedFeedback(feedback);
    onSaved(feedback);
  }

  function adoptLatestVersion(feedback: FeedbackRow) {
    setExternalVersionWarning("");
    setLatestExternalFeedback(null);
    setSelectedFeedback(feedback);
  }

  useEffect(() => {
    if (isAdmin) return;

    dirtyRef.current = false;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setExternalVersionWarning("");
      setLatestExternalFeedback(null);
      setSelectedFeedback(null);
    });

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedFeedback) return;

    const refreshedFeedback = items.find(
      (feedback) => feedback.id === selectedFeedback.id,
    );
    if (
      !refreshedFeedback ||
      refreshedFeedback.updated_at === selectedFeedback.updated_at
    ) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;

      if (dirtyRef.current) {
        setExternalVersionWarning(
          "Este feedback foi atualizado em outra tela. Seu rascunho foi preservado; use Atualizar e confira a versão mais recente antes de salvar.",
        );
        setLatestExternalFeedback(refreshedFeedback);
        return;
      }

      setExternalVersionWarning("");
      setLatestExternalFeedback(null);
      setSelectedFeedback(refreshedFeedback);
    });

    return () => {
      cancelled = true;
    };
  }, [items, selectedFeedback]);

  useAccessibleFullscreenDialog({
    open: active && Boolean(selectedFeedback),
    dialogRef,
    initialFocusRef: closeButtonRef,
    onClose: closeEditor,
  });

  if (!isAdmin) {
    return (
      <FeedbackMessage tone="danger">
        Acesso negado. Somente administradores podem gerenciar feedbacks.
      </FeedbackMessage>
    );
  }

  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">
            Central de gerenciamento
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Os números abaixo consideram todos os feedbacks recebidos.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || summaryLoading}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-teal-300 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          {loading || summaryLoading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {summaryError ? (
        <FeedbackMessage tone="warning">{summaryError}</FeedbackMessage>
      ) : null}

      <section
        aria-label="Resumo dos feedbacks"
        aria-busy={summaryLoading}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
      >
        {[
          { label: "Total", value: summary.total, detail: "recebidos" },
          { label: "Novos", value: summary.novos, detail: "aguardando triagem" },
          {
            label: "Em análise",
            value: summary.emAnalise,
            detail: "em atendimento",
          },
          {
            label: "Respondidos",
            value: summary.respondidos,
            detail: "com retorno enviado",
          },
          {
            label: "Resolvidos",
            value: summary.resolvidos,
            detail: "atendimentos concluídos",
          },
          {
            label: "Arquivados",
            value: summary.arquivados,
            detail: "fora da fila ativa",
          },
        ].map((counter) => (
          <div
            key={counter.label}
            className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
          >
            <p className="break-words text-[0.68rem] font-bold uppercase tracking-[0.1em] text-slate-500 sm:text-xs">
              {counter.label}
            </p>
            <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-slate-950 sm:text-3xl">
              {counter.value}
            </p>
            <p className="mt-1 break-words text-[0.7rem] text-slate-500 sm:text-xs">
              {counter.detail}
            </p>
          </div>
        ))}
      </section>

      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <label className="grid min-w-0 flex-1 gap-1.5" htmlFor="feedback-search">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
              Buscar
            </span>
            <input
              id="feedback-search"
              type="search"
              value={searchInput}
              onChange={(event) => onSearchInputChange(event.target.value)}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-950 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              placeholder="Assunto, mensagem, e-mail ou protocolo FB-"
            />
          </label>

          <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:flex-[2]">
            <label className="grid gap-1.5" htmlFor="feedback-status-filter">
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                Status
              </span>
              <select
                id="feedback-status-filter"
                value={statusFilter}
                onChange={(event) =>
                  onStatusFilterChange(event.target.value as FeedbackStatus | "")
                }
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              >
                <option value="">Todos</option>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5" htmlFor="feedback-category-filter">
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                Tipo
              </span>
              <select
                id="feedback-category-filter"
                value={categoryFilter}
                onChange={(event) =>
                  onCategoryFilterChange(
                    event.target.value as FeedbackCategory | "",
                  )
                }
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              >
                <option value="">Todos</option>
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label
              className="col-span-2 grid gap-1.5 sm:col-span-1"
              htmlFor="feedback-area-filter"
            >
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                Área
              </span>
              <select
                id="feedback-area-filter"
                value={areaFilter}
                onChange={(event) =>
                  onAreaFilterChange(event.target.value as FeedbackArea | "")
                }
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              >
                <option value="">Todas</option>
                {areaOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      {error ? <FeedbackMessage tone="danger">{error}</FeedbackMessage> : null}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
        <section className="min-w-0" aria-labelledby="management-list-title">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="management-list-title" className="text-lg font-bold text-slate-950">
                Feedbacks recebidos
              </h2>
              <p className="mt-1 text-sm text-slate-500">{total} resultado(s)</p>
            </div>
            <p className="text-xs font-semibold text-slate-500">
              Página {page} de {totalPages}
            </p>
          </div>

          {loading && !items.length ? (
            <div
              className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600 shadow-sm"
              role="status"
            >
              Carregando feedbacks...
            </div>
          ) : items.length ? (
            <div className="grid gap-3" aria-busy={loading}>
              {items.map((feedback) => {
                const selected = feedback.id === selectedFeedback?.id;
                return (
                  <button
                    key={feedback.id}
                    type="button"
                    onClick={() => selectFeedback(feedback)}
                    aria-pressed={selected}
                    className={`min-w-0 rounded-2xl border p-4 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 ${
                      selected
                        ? "border-teal-400 bg-teal-50/70"
                        : "border-slate-200 bg-white hover:border-teal-200 hover:bg-teal-50/20"
                    }`}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusPill status={feedback.status} />
                      <CategoryPill category={feedback.category} />
                    </span>
                    <span className="mt-3 block break-words text-sm font-bold text-slate-950">
                      {feedback.subject}
                    </span>
                    <span className="mt-1 block break-all text-xs font-semibold text-slate-500">
                      {feedback.sender_email || "E-mail não informado"}
                    </span>
                    <span className="mt-2 block text-xs text-slate-500">
                      {formatProtocol(feedback.id)} · {formatDate(feedback.created_at)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : !error ? (
            <EmptyState>Nenhum feedback corresponde aos filtros.</EmptyState>
          ) : null}

          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={loading || page <= 1}
                onClick={() => onPageChange(page - 1)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-teal-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={loading || page >= totalPages}
                onClick={() => onPageChange(page + 1)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-teal-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                Próxima
              </button>
            </div>
          ) : null}
        </section>

        <section
          ref={dialogRef}
          tabIndex={-1}
          role={mobileViewport && selectedFeedback ? "dialog" : undefined}
          aria-modal={mobileViewport && selectedFeedback ? true : undefined}
          aria-labelledby={
            selectedFeedback ? `management-editor-title-${selectedFeedback.id}` : undefined
          }
          className={`min-w-0 outline-none ${
            selectedFeedback
              ? "fixed inset-0 z-50 h-dvh overflow-y-auto bg-slate-100 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] xl:static xl:h-auto xl:overflow-visible xl:bg-transparent xl:p-0"
              : "hidden xl:block"
          }`}
        >
          {selectedFeedback ? (
            <ManagementEditor
              key={selectedFeedback.id}
              feedback={selectedFeedback}
              accessToken={accessToken}
              onSaved={applySavedFeedback}
              dirtyRef={dirtyRef}
              editorSavingRef={editorSavingRef}
              closeButtonRef={closeButtonRef}
              onRequestClose={closeEditor}
              externalVersionWarning={externalVersionWarning}
              latestExternalFeedback={latestExternalFeedback}
              onRefresh={onRefresh}
              onAdoptLatestVersion={adoptLatestVersion}
            />
          ) : (
            <EmptyState>
              Selecione um feedback da lista para ver os dados do usuário,
              responder e alterar o status.
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}

export function FeedbackView({
  mode = "user",
}: {
  mode?: FeedbackViewMode;
}) {
  const managementMode = mode === "management";
  const { session, user } = useAuth();
  const {
    status: adminAccessStatus,
    error: adminStatusError,
    refresh: refreshAdminAccess,
  } = useFeedbackAdminAccess();
  const ownRequestRef = useRef(0);
  const managementRequestRef = useRef(0);
  const summaryRequestRef = useRef(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    managementMode ? "manage" : "submit",
  );
  const [ownFeedbacks, setOwnFeedbacks] = useState<FeedbackRow[]>([]);
  const [ownLoading, setOwnLoading] = useState(true);
  const [ownError, setOwnError] = useState("");
  const [ownPage, setOwnPage] = useState(1);
  const [ownTotal, setOwnTotal] = useState(0);
  const [ownLoaded, setOwnLoaded] = useState(false);
  const [managedFeedbacks, setManagedFeedbacks] = useState<FeedbackRow[]>([]);
  const [managementLoading, setManagementLoading] = useState(true);
  const [managementError, setManagementError] = useState("");
  const [managementTotal, setManagementTotal] = useState(0);
  const [managementPage, setManagementPage] = useState(1);
  const [managementSummary, setManagementSummary] =
    useState<FeedbackManagementSummary>(emptyManagementSummary);
  const [managementSummaryLoading, setManagementSummaryLoading] =
    useState(true);
  const [managementSummaryError, setManagementSummaryError] = useState("");
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "">("");
  const [categoryFilter, setCategoryFilter] =
    useState<FeedbackCategory | "">("");
  const [areaFilter, setAreaFilter] = useState<FeedbackArea | "">("");
  const [managementSearchInput, setManagementSearchInput] = useState("");
  const [managementSearch, setManagementSearch] = useState("");
  const isAdmin = adminAccessStatus === "allowed";
  const adminStatusLoading = adminAccessStatus === "checking";

  const databaseContext = useMemo(
    () => ({
      userId: user?.id,
      accessToken: session?.access_token,
    }),
    [session?.access_token, user?.id],
  );

  const loadOwnPage = useCallback(
    async (targetPage = ownPage) => {
      if (!databaseContext.userId || !databaseContext.accessToken) return;

      const requestId = ++ownRequestRef.current;
      const isCurrent = () => requestId === ownRequestRef.current;
      setOwnLoading(true);
      setOwnError("");

      try {
        const result = await getOwnFeedbackPage(
          { page: targetPage, pageSize: FEEDBACK_PAGE_SIZE },
          databaseContext,
        );
        if (!isCurrent()) return;
        setOwnFeedbacks(result.items);
        setOwnTotal(result.total);
        setOwnLoaded(true);
        if (result.page !== ownPage) setOwnPage(result.page);
      } catch (loadError) {
        if (!isCurrent()) return;
        setOwnError(formatDatabaseError(loadError));
      } finally {
        if (isCurrent()) setOwnLoading(false);
      }
    },
    [databaseContext, ownPage, setOwnPage],
  );

  const loadManagementSummary = useCallback(async () => {
    if (!isAdmin || !databaseContext.userId || !databaseContext.accessToken) {
      return;
    }

    const requestId = ++summaryRequestRef.current;
    const isCurrent = () => requestId === summaryRequestRef.current;
    setManagementSummaryLoading(true);
    setManagementSummaryError("");

    try {
      const summary = await getFeedbackManagementSummary(databaseContext);
      if (!isCurrent()) return;
      setManagementSummary(summary);
    } catch (loadError) {
      if (!isCurrent()) return;
      setManagementSummaryError(formatDatabaseError(loadError));
    } finally {
      if (isCurrent()) setManagementSummaryLoading(false);
    }
  }, [databaseContext, isAdmin]);

  const loadManagement = useCallback(async () => {
    if (!isAdmin) {
      setManagementError(
        "Acesso negado. Somente administradores podem gerenciar feedbacks.",
      );
      return;
    }
    if (!databaseContext.userId || !databaseContext.accessToken) return;

    const requestId = ++managementRequestRef.current;
    const isCurrent = () => requestId === managementRequestRef.current;
    setManagementLoading(true);
    setManagementError("");

    try {
      const result = await getFeedbacksForManagement(
        {
          status: statusFilter || undefined,
          category: categoryFilter || undefined,
          area: areaFilter || undefined,
          search: managementSearch || undefined,
          page: managementPage,
          pageSize: FEEDBACK_PAGE_SIZE,
        },
        databaseContext,
      );
      if (!isCurrent()) return;
      setManagementTotal(result.total);
      const lastPage = Math.max(
        1,
        Math.ceil(result.total / FEEDBACK_PAGE_SIZE),
      );
      if (result.page > lastPage) {
        setManagedFeedbacks([]);
        setManagementPage(lastPage);
        return;
      }

      setManagedFeedbacks(result.items);
      if (result.page !== managementPage) setManagementPage(result.page);
    } catch (loadError) {
      if (!isCurrent()) return;
      setManagementError(formatDatabaseError(loadError));
      void refreshAdminAccess();
    } finally {
      if (isCurrent()) setManagementLoading(false);
    }
  }, [
    areaFilter,
    categoryFilter,
    databaseContext,
    isAdmin,
    managementPage,
    managementSearch,
    refreshAdminAccess,
    setManagementPage,
    statusFilter,
  ]);

  useEffect(() => {
    if (!managementMode) return;

    const timeout = window.setTimeout(() => {
      setManagementSearch(managementSearchInput.trim());
      setManagementPage(1);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [managementMode, managementSearchInput]);

  useEffect(() => {
    if (activeTab !== "mine") return;

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadOwnPage();
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, loadOwnPage]);

  useEffect(() => {
    if (activeTab !== "manage" || !isAdmin) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadManagement();
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, isAdmin, loadManagement]);

  useEffect(() => {
    if (activeTab !== "manage" || !isAdmin) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadManagementSummary();
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, isAdmin, loadManagementSummary]);

  useEffect(() => {
    if (!managementMode || isAdmin) return;

    managementRequestRef.current += 1;
    summaryRequestRef.current += 1;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setManagedFeedbacks([]);
      setManagementTotal(0);
      setManagementSummary(emptyManagementSummary);
    });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, managementMode]);

  function selectTab(tab: ActiveTab) {
    if (tab === "manage" && !isAdmin) return;
    setActiveTab(tab);
  }

  function addCreatedFeedback(feedback: FeedbackRow) {
    setOwnPage(1);
    setOwnTotal((current) => current + 1);
    setOwnFeedbacks((current) => [
      feedback,
      ...current.filter((item) => item.id !== feedback.id),
    ].slice(0, FEEDBACK_PAGE_SIZE));
    setOwnError("");
    void loadOwnPage(1);
  }

  function applyManagedFeedback(feedback: FeedbackRow) {
    setManagedFeedbacks((current) =>
      current.map((item) => (item.id === feedback.id ? feedback : item)),
    );
    setOwnFeedbacks((current) =>
      current.map((item) => (item.id === feedback.id ? feedback : item)),
    );
    void loadManagement();
    void loadManagementSummary();
  }

  function refreshManagement() {
    void loadManagement();
    void loadManagementSummary();
  }

  function updateStatusFilter(value: FeedbackStatus | "") {
    setStatusFilter(value);
    setManagementPage(1);
  }

  function updateCategoryFilter(value: FeedbackCategory | "") {
    setCategoryFilter(value);
    setManagementPage(1);
  }

  function updateAreaFilter(value: FeedbackArea | "") {
    setAreaFilter(value);
    setManagementPage(1);
  }

  const tabs: Array<{ id: ActiveTab; label: string; count?: number }> = [
    { id: "submit", label: "Enviar" },
    {
      id: "mine",
      label: "Meus feedbacks",
      count: ownLoaded ? ownTotal : undefined,
    },
  ];

  function handleTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    selectTab(nextTab.id);
    window.requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus());
  }

  if (managementMode) {
    return (
      <section
        className="grid min-w-0 gap-5"
        aria-label="Administração de feedbacks"
      >
        {adminStatusLoading ? (
          <div
            className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-600 shadow-sm"
            role="status"
          >
            Verificando acesso administrativo...
          </div>
        ) : null}

        {adminAccessStatus === "error" ? (
          <div className="grid gap-3">
            <FeedbackMessage tone="warning">
              Não foi possível verificar seu acesso administrativo
              {adminStatusError ? `: ${adminStatusError}` : "."}
            </FeedbackMessage>
            <button
              type="button"
              onClick={() => void refreshAdminAccess()}
              className="inline-flex min-h-11 w-fit items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-teal-300 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}

        {!adminStatusLoading && adminAccessStatus !== "error" ? (
          <ManagementPanel
            isAdmin={isAdmin}
            active
            accessToken={session?.access_token ?? ""}
            items={managedFeedbacks}
            total={managementTotal}
            page={managementPage}
            pageSize={FEEDBACK_PAGE_SIZE}
            summary={managementSummary}
            loading={managementLoading}
            summaryLoading={managementSummaryLoading}
            error={managementError}
            summaryError={managementSummaryError}
            statusFilter={statusFilter}
            categoryFilter={categoryFilter}
            areaFilter={areaFilter}
            searchInput={managementSearchInput}
            onStatusFilterChange={updateStatusFilter}
            onCategoryFilterChange={updateCategoryFilter}
            onAreaFilterChange={updateAreaFilter}
            onSearchInputChange={setManagementSearchInput}
            onPageChange={setManagementPage}
            onRefresh={refreshManagement}
            onSaved={applyManagedFeedback}
          />
        ) : null}
      </section>
    );
  }

  return (
    <section className="grid min-w-0 gap-5" aria-label="Central de feedback">
      <div
        className="app-scroll-region-x flex max-w-full gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
        role="tablist"
        aria-label="Áreas da central de feedback"
      >
        {tabs.map((tab, index) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`feedback-tab-${tab.id}`}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              tabIndex={active ? 0 : -1}
              aria-selected={active}
              aria-controls={`feedback-panel-${tab.id}`}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`inline-flex min-h-11 min-w-max items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 ${
                active
                  ? "bg-teal-700 text-white shadow-md shadow-teal-900/15"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              {tab.label}
              {typeof tab.count === "number" ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        id="feedback-panel-submit"
        role="tabpanel"
        aria-labelledby="feedback-tab-submit"
        hidden={activeTab !== "submit"}
        className="min-w-0"
      >
        <SubmitFeedbackForm onCreated={addCreatedFeedback} />
      </div>

      <div
        id="feedback-panel-mine"
        role="tabpanel"
        aria-labelledby="feedback-tab-mine"
        hidden={activeTab !== "mine"}
        className="min-w-0"
      >
        <FeedbackHistory
          items={ownFeedbacks}
          loading={ownLoading}
          error={ownError}
          page={ownPage}
          pageSize={FEEDBACK_PAGE_SIZE}
          total={ownTotal}
          onPageChange={setOwnPage}
          onRefresh={() => void loadOwnPage()}
        />
      </div>

    </section>
  );
}
