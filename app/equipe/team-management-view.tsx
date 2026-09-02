"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  Badge,
  EmptyState,
  FeedbackMessage,
  StatCard,
} from "@/app/_components/ui";
import { useAuth } from "@/app/_lib/auth-context";

import {
  TEAM_MEMBER_STATUSES,
  TEAM_PERMISSIONS,
  TEAM_PERMISSION_DESCRIPTIONS,
  TEAM_PERMISSION_LABELS,
  TEAM_ROLES,
  TEAM_STATUS_LABELS,
  getFallbackPermissionsForRole,
  isTeamPermission,
  resolveTeamPermissionDependencies,
  toggleTeamPermission,
  type TeamActivity,
  type TeamAdminSnapshot,
  type TeamMember,
  type TeamMemberStatus,
  type TeamPermission,
  type TeamRole,
} from "./team-contract";

type Notice = {
  tone: "success" | "warning" | "danger" | "neutral";
  text: string;
};

type TeamApiError = Error & { status?: number };

type MemberDraft = {
  displayName: string;
  permissions: TeamPermission[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getResponseMessage(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.message === "string"
    ? value.message
    : fallback;
}

async function readJsonResponse(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function teamRequest(
  accessToken: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch("/api/equipe", {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = await readJsonResponse(response);

  if (!response.ok) {
    const error = new Error(
      getResponseMessage(body, "Não foi possível concluir a operação."),
    ) as TeamApiError;
    error.status = response.status;
    throw error;
  }

  return body;
}

function normalizeSnapshot(value: unknown): TeamAdminSnapshot | null {
  if (!isRecord(value) || !isRecord(value.snapshot)) return null;

  const snapshot = value.snapshot;
  if (
    !isRecord(snapshot.context) ||
    !Array.isArray(snapshot.members) ||
    !Array.isArray(snapshot.activities)
  ) {
    return null;
  }

  const context = snapshot.context;
  if (
    typeof context.account_id !== "string" ||
    typeof context.actor_user_id !== "string" ||
    !TEAM_ROLES.includes(context.role as TeamRole) ||
    typeof context.account_name !== "string" ||
    typeof context.can_manage_team !== "boolean"
  ) {
    return null;
  }

  const contextRole = context.role as TeamRole;
  const contextPermissions = Array.isArray(context.permissions) &&
    context.permissions.every(isTeamPermission)
    ? resolveTeamPermissionDependencies(context.permissions)
    : getFallbackPermissionsForRole(contextRole);

  const members = snapshot.members.flatMap((candidate): TeamMember[] => {
    if (
      !isRecord(candidate) ||
      typeof candidate.user_id !== "string" ||
      typeof candidate.email !== "string" ||
      !TEAM_ROLES.includes(candidate.role as TeamRole) ||
      !TEAM_MEMBER_STATUSES.includes(candidate.status as TeamMemberStatus) ||
      typeof candidate.created_at !== "string"
    ) {
      return [];
    }

    const role = candidate.role as TeamRole;
    const permissions = Array.isArray(candidate.permissions) &&
      candidate.permissions.every(isTeamPermission)
      ? resolveTeamPermissionDependencies(candidate.permissions)
      : getFallbackPermissionsForRole(role);

    return [{
      user_id: candidate.user_id,
      display_name:
        typeof candidate.display_name === "string" && candidate.display_name.trim()
          ? candidate.display_name.trim()
          : candidate.email,
      email: candidate.email,
      role,
      permissions,
      status: candidate.status as TeamMemberStatus,
      created_at: candidate.created_at,
      updated_at: typeof candidate.updated_at === "string" ? candidate.updated_at : null,
      last_activity_at:
        typeof candidate.last_activity_at === "string" ? candidate.last_activity_at : null,
    }];
  });

  const activities = snapshot.activities.flatMap((candidate): TeamActivity[] => {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      typeof candidate.action !== "string" ||
      typeof candidate.entity_type !== "string" ||
      typeof candidate.occurred_at !== "string"
    ) {
      return [];
    }

    return [{
      id: candidate.id,
      actor_user_id:
        typeof candidate.actor_user_id === "string" ? candidate.actor_user_id : null,
      actor_display_name:
        typeof candidate.actor_display_name === "string"
          ? candidate.actor_display_name
          : "Usuário não identificado",
      action: candidate.action,
      entity_type: candidate.entity_type,
      description:
        typeof candidate.description === "string" ? candidate.description : "",
      occurred_at: candidate.occurred_at,
    }];
  });

  return {
    context: {
      account_id: context.account_id,
      actor_user_id: context.actor_user_id,
      role: contextRole,
      permissions: contextPermissions,
      display_name:
        typeof context.display_name === "string" ? context.display_name : "Usuário",
      account_name: context.account_name,
      can_manage_team:
        contextRole === "owner" ||
        contextRole === "admin" ||
        contextPermissions.includes("team.manage"),
    },
    members,
    activities,
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "Ainda sem atividade";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

const ACTIVITY_LABELS: Record<string, string> = {
  "team.member_added": "Usuário cadastrado na equipe",
  "team.member_updated": "Acesso de usuário atualizado",
  "sessoes_bipagem.aberta": "Bipagem iniciada",
  "sessoes_bipagem.finalizada": "Bipagem finalizada",
  "sessoes_bipagem.cancelada": "Bipagem cancelada",
  "itens_sessao_bipagem.insert": "Código adicionado ao lote",
  "itens_sessao_bipagem.update": "Código do lote atualizado",
  "itens_sessao_bipagem.delete": "Código removido do lote",
  "itens_sessao_bipagem.removido": "Código removido do lote",
  "pacotes.insert": "Pacote registrado",
  "pacotes.update": "Pacote atualizado",
  "pacotes.delete": "Pacote removido",
  "pacotes_cancelados.insert": "Pacote cancelado",
  "movimentacoes.insert": "Movimentação registrada",
  "lojas.insert": "Loja cadastrada",
  "lojas.update": "Loja atualizada",
  "lojas.delete": "Loja removida",
  "marketplaces.insert": "Marketplace cadastrado",
  "marketplaces.update": "Marketplace atualizado",
  "marketplaces.delete": "Marketplace removido",
  "transportadoras.insert": "Transportadora cadastrada",
  "transportadoras.update": "Transportadora atualizada",
  "transportadoras.delete": "Transportadora removida",
  "relatorio_destinatarios.insert": "Destinatário de relatório cadastrado",
  "relatorio_destinatarios.update": "Destinatário de relatório atualizado",
  "relatorio_destinatarios.delete": "Destinatário de relatório removido",
  "relatorio_envios.insert": "Relatório enviado",
  "relatorio_envios.enviado": "Relatório enviado",
  "relatorio_envios.erro": "Falha ao enviar relatório",
};

function getActivityLabel(activity: TeamActivity) {
  return (
    activity.description?.trim() ||
    ACTIVITY_LABELS[activity.action] ||
    `Ação registrada em ${activity.entity_type}`
  );
}

function PermissionChecklist({
  value,
  onChange,
  disabled = false,
  allowTeamManagement,
  legend = "O que este usuário pode fazer?",
}: {
  value: readonly TeamPermission[];
  onChange: (permissions: TeamPermission[]) => void;
  disabled?: boolean;
  allowTeamManagement: boolean;
  legend?: string;
}) {
  const groupId = useId();
  const visiblePermissions = TEAM_PERMISSIONS.filter(
    (permission) => allowTeamManagement || permission !== "team.manage",
  );
  const allSelected = visiblePermissions.every((permission) =>
    value.includes(permission),
  );

  return (
    <fieldset
      className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4"
      disabled={disabled}
      aria-describedby={`${groupId}-help`}
    >
      <legend className="px-1 text-sm font-bold text-slate-900">{legend}</legend>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p id={`${groupId}-help`} className="mt-1 text-xs leading-5 text-slate-500">
          Acessos complementares são marcados ou removidos automaticamente.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || allSelected}
            onClick={() =>
              onChange(resolveTeamPermissionDependencies(visiblePermissions))
            }
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-teal-200 bg-white px-3 text-xs font-bold text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            Selecionar tudo
          </button>
          <button
            type="button"
            disabled={disabled || value.length === 0}
            onClick={() => onChange([])}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            Limpar tudo
          </button>
        </div>
      </div>

      <div
        id={`${groupId}-options`}
        className="mt-3 grid gap-2 lg:grid-cols-2"
      >
        {visiblePermissions.map((permission) => {
          const inputId = `${groupId}-${permission.replaceAll(".", "-")}`;
          const checked = value.includes(permission);

          return (
            <label
              key={permission}
              htmlFor={inputId}
              className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                checked
                  ? "border-teal-300 bg-teal-50/80 shadow-sm"
                  : "border-slate-200 bg-white hover:border-teal-200"
              } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
            >
              <input
                id={inputId}
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onChange(
                    toggleTeamPermission(
                      value,
                      permission,
                      event.target.checked,
                    ),
                  )
                }
                className="mt-0.5 size-5 shrink-0 accent-teal-700"
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900">
                  {TEAM_PERMISSION_LABELS[permission]}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                  {TEAM_PERMISSION_DESCRIPTIONS[permission]}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function MemberCard({
  member,
  currentUserId,
  managerRole,
  saving,
  onSave,
  onToggleStatus,
}: {
  member: TeamMember;
  currentUserId: string;
  managerRole: TeamRole;
  saving: boolean;
  onSave: (member: TeamMember, draft: MemberDraft) => Promise<void>;
  onToggleStatus: (member: TeamMember) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(member.display_name);
  const [permissions, setPermissions] = useState<TeamPermission[]>(
    member.permissions,
  );
  const isOwner = member.role === "owner";
  const hasLegacyFullAccess = isOwner || member.role === "admin";
  const isCurrentUser = member.user_id === currentUserId;
  const isProtectedFromManager =
    managerRole !== "owner" &&
    (hasLegacyFullAccess || member.permissions.includes("team.manage"));
  const canEditMember = !isOwner && !isCurrentUser && !isProtectedFromManager;
  const canEditPermissions = canEditMember && !hasLegacyFullAccess;
  const changed =
    displayName.trim() !== member.display_name ||
    permissions.join("|") !== member.permissions.join("|");

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words font-bold text-slate-950">
              {member.display_name || member.email}
            </h3>
            {isCurrentUser ? <Badge tone="blue">Você</Badge> : null}
            <Badge tone={member.status === "active" ? "green" : "red"}>
              {TEAM_STATUS_LABELS[member.status]}
            </Badge>
          </div>
          <p className="mt-1 break-all text-sm text-slate-500">{member.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={hasLegacyFullAccess ? "purple" : "blue"}>
              {hasLegacyFullAccess
                ? "Acesso total"
                : `${member.permissions.length} ${member.permissions.length === 1 ? "acesso" : "acessos"}`}
            </Badge>
            <span className="text-xs font-medium text-slate-500">
              Última atividade: {formatDateTime(member.last_activity_at)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4">
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Nome
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={saving || !canEditMember}
            maxLength={120}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:bg-slate-100"
          />
        </label>

        {hasLegacyFullAccess ? (
          <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
            <p className="font-bold">
              {isOwner ? "Proprietário da conta" : "Administrador existente"}
            </p>
            <p className="mt-1 leading-6 text-violet-800">
              Este usuário possui acesso total. As permissões individuais não podem ser reduzidas enquanto este acesso especial estiver ativo.
            </p>
          </div>
        ) : (
          <PermissionChecklist
            value={permissions}
            onChange={setPermissions}
            disabled={saving || !canEditPermissions}
            allowTeamManagement={managerRole === "owner"}
            legend="Acessos liberados"
          />
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={saving || !canEditMember || !changed || !displayName.trim()}
            onClick={() => void onSave(member, { displayName, permissions })}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Salvar
          </button>
          <button
            type="button"
            disabled={saving || !canEditMember}
            onClick={() => void onToggleStatus(member)}
            className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 ${
              member.status === "active"
                ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            {member.status === "active" ? "Suspender" : "Ativar"}
          </button>
        </div>
      </div>
    </article>
  );
}

export function TeamManagementView() {
  const { session, user } = useAuth();
  const [snapshot, setSnapshot] = useState<TeamAdminSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<TeamPermission[]>([]);
  const accessToken = session?.access_token ?? "";

  const activeMembers = useMemo(
    () => snapshot?.members.filter((member) => member.status === "active").length ?? 0,
    [snapshot?.members],
  );
  const suspendedMembers = (snapshot?.members.length ?? 0) - activeMembers;
  const loadSnapshot = useCallback(async () => {
    if (!accessToken) return;

    setLoading(true);
    setNotice(null);
    setForbidden(false);

    try {
      const body = await teamRequest(accessToken);
      const normalized = normalizeSnapshot(body);
      if (!normalized) throw new Error("O servidor retornou dados de equipe inválidos.");
      setSnapshot(normalized);
    } catch (error) {
      const teamError = error as TeamApiError;
      if (teamError.status === 403) {
        setForbidden(true);
        setSnapshot(null);
      } else {
        setNotice({
          tone: "danger",
          text: teamError.message || "Não foi possível carregar a equipe.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) void loadSnapshot();
    });

    return () => {
      cancelled = true;
    };
  }, [loadSnapshot]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    setCreating(true);
    setNotice(null);

    try {
      await teamRequest(accessToken, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          permissions,
        }),
      });
      setName("");
      setEmail("");
      setPassword("");
      setPermissions([]);
      setNotice({
        tone: "success",
        text: "Usuário cadastrado. Ele já pode entrar com o e-mail e a senha inicial.",
      });
      await loadSnapshot();
    } catch (error) {
      setNotice({
        tone: "danger",
        text: error instanceof Error ? error.message : "Não foi possível cadastrar o usuário.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function updateMember(
    member: TeamMember,
    draft: MemberDraft,
    status: TeamMemberStatus = member.status,
  ) {
    if (!accessToken) return;

    setSavingUserId(member.user_id);
    setNotice(null);

    try {
      await teamRequest(accessToken, {
        method: "PATCH",
        body: JSON.stringify({
          userId: member.user_id,
          name: draft.displayName.trim(),
          permissions: draft.permissions,
          status,
        }),
      });
      setNotice({ tone: "success", text: "Usuário atualizado com sucesso." });
      await loadSnapshot();
    } catch (error) {
      setNotice({
        tone: "danger",
        text: error instanceof Error ? error.message : "Não foi possível atualizar o usuário.",
      });
    } finally {
      setSavingUserId(null);
    }
  }

  if (loading && !snapshot) {
    return <FeedbackMessage tone="neutral">Carregando equipe...</FeedbackMessage>;
  }

  if (forbidden) {
    return (
      <FeedbackMessage tone="warning">
        Você não possui permissão para gerenciar usuários. Solicite acesso ao responsável pela conta.
      </FeedbackMessage>
    );
  }

  return (
    <>
      {notice ? <FeedbackMessage tone={notice.tone}>{notice.text}</FeedbackMessage> : null}

      <section className="app-card-grid gap-4">
        <StatCard label="Usuários ativos" value={activeMembers} detail="Pessoas com acesso liberado." tone="teal" />
        <StatCard label="Suspensos" value={suspendedMembers} detail="Acessos temporariamente bloqueados." tone="rose" />
        <StatCard
          label="Seus acessos"
          value={
            snapshot?.context.role === "owner" || snapshot?.context.role === "admin"
              ? "Acesso total"
              : `${snapshot?.context.permissions.length ?? 0} liberados`
          }
          detail={snapshot?.context.account_name || "Conta operacional"}
          tone="blue"
        />
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-5">
          <h2 className="text-xl font-bold tracking-[-0.025em] text-slate-950">Cadastrar usuário</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Crie um login individual para que todas as ações fiquem identificadas.
          </p>
        </div>
        <form className="grid gap-4 lg:grid-cols-2" onSubmit={handleCreate}>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Nome
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={120}
              required
              autoComplete="name"
              className="min-h-12 rounded-xl border border-slate-300 px-4 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              placeholder="Nome do funcionário"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Login (e-mail)
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              autoComplete="email"
              className="min-h-12 rounded-xl border border-slate-300 px-4 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              placeholder="funcionario@empresa.com"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Senha inicial
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              maxLength={128}
              type="password"
              autoComplete="new-password"
              className="min-h-12 rounded-xl border border-slate-300 px-4 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              placeholder="Mínimo de 8 caracteres"
            />
            <span className="text-xs font-medium text-slate-500">
              Oriente o usuário a trocar a senha após o primeiro acesso.
            </span>
          </label>
          <div className="lg:col-span-2">
            <PermissionChecklist
              value={permissions}
              onChange={setPermissions}
              disabled={creating}
              allowTeamManagement={snapshot?.context.role === "owner"}
            />
            {permissions.length === 0 ? (
              <p className="mt-2 text-xs font-semibold text-amber-700">
                Sem acessos marcados, o usuário poderá entrar apenas para enviar feedback.
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-teal-700 px-5 text-sm font-bold text-white shadow-lg shadow-teal-900/15 transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 lg:col-span-2 lg:justify-self-start"
          >
            {creating ? "Cadastrando..." : "Cadastrar usuário"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-5">
          <h2 className="text-xl font-bold tracking-[-0.025em] text-slate-950">Usuários cadastrados</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Suspender preserva todo o histórico e bloqueia novas ações na conta.
          </p>
        </div>
        <div className="grid gap-3">
          {snapshot?.members.length ? (
            snapshot.members.map((member) => (
              <MemberCard
                key={`${member.user_id}:${member.updated_at ?? "sem-atualizacao"}:${member.status}:${member.role}:${member.permissions.join(",")}:${member.display_name}`}
                member={member}
                currentUserId={user?.id ?? ""}
                managerRole={snapshot.context.role}
                saving={savingUserId === member.user_id}
                onSave={(target, draft) => updateMember(target, draft)}
                onToggleStatus={(target) =>
                  updateMember(
                    target,
                    {
                      displayName: target.display_name,
                      permissions: target.permissions,
                    },
                    target.status === "active" ? "suspended" : "active",
                  )
                }
              />
            ))
          ) : (
            <EmptyState>Nenhum usuário foi encontrado nesta conta.</EmptyState>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-5">
          <h2 className="text-xl font-bold tracking-[-0.025em] text-slate-950">Atividades recentes</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Registro de quem realizou as alterações mais recentes.
          </p>
        </div>
        {snapshot?.activities.length ? (
          <ol className="grid gap-3">
            {snapshot.activities.map((activity) => (
              <li key={activity.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{getActivityLabel(activity)}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Por {activity.actor_display_name || "Usuário não identificado"}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {formatDateTime(activity.occurred_at)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState>As próximas ações identificadas aparecerão aqui.</EmptyState>
        )}
      </section>
    </>
  );
}
