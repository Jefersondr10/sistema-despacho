import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  TEAM_MEMBER_STATUSES,
  TEAM_PERMISSIONS,
  TEAM_ROLES,
  getFallbackPermissionsForRole,
  isTeamPermission,
  resolveTeamPermissionDependencies,
  type TeamContext,
  type TeamPermission,
  type TeamMemberStatus,
  type TeamRole,
} from "@/app/equipe/team-contract";
import {
  createSupabaseClientForAccessToken,
  getSupabaseConfig,
  isSupabaseConfigured,
} from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

const REQUEST_BODY_LIMIT_BYTES = 12 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AuthenticatedTeamRequest = {
  supabase: SupabaseClient;
  context: TeamContext;
};

type TeamRequestError = Error & { status?: number };

function requestError(status: number, message: string) {
  const error = new Error(message) as TeamRequestError;
  error.status = status;
  return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const received = Object.keys(value).sort();
  const expected = [...keys].sort();
  return received.length === expected.length && received.every((key, index) => key === expected[index]);
}

function isRole(value: unknown): value is TeamRole {
  return typeof value === "string" && TEAM_ROLES.includes(value as TeamRole);
}

function isStatus(value: unknown): value is TeamMemberStatus {
  return typeof value === "string" && TEAM_MEMBER_STATUSES.includes(value as TeamMemberStatus);
}

function normalizePermissions(value: unknown) {
  if (!Array.isArray(value) || value.length > TEAM_PERMISSIONS.length) {
    throw requestError(400, "Permissões inválidas.");
  }
  if (value.some((permission) => !isTeamPermission(permission))) {
    throw requestError(400, "Uma ou mais permissões são inválidas.");
  }

  return resolveTeamPermissionDependencies(value as TeamPermission[]);
}

function normalizeName(value: unknown) {
  if (typeof value !== "string") throw requestError(400, "Nome inválido.");
  const name = value.trim();
  if (Array.from(name).length < 2 || Array.from(name).length > 120) {
    throw requestError(400, "O nome deve ter entre 2 e 120 caracteres.");
  }
  return name;
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") throw requestError(400, "E-mail inválido.");
  const email = value.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 320 ||
    /\s/.test(email) ||
    email.indexOf("@") <= 0 ||
    email.lastIndexOf("@") !== email.indexOf("@") ||
    email.indexOf("@") >= email.length - 1
  ) {
    throw requestError(400, "E-mail inválido.");
  }
  return email;
}

async function readJsonBody(request: Request) {
  const declaredLength = request.headers.get("content-length")?.trim() ?? "";
  if (/^\d+$/.test(declaredLength) && Number(declaredLength) > REQUEST_BODY_LIMIT_BYTES) {
    throw requestError(413, "O conteúdo enviado excede o limite permitido.");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > REQUEST_BODY_LIMIT_BYTES) {
    throw requestError(413, "O conteúdo enviado excede o limite permitido.");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw requestError(400, "Payload JSON inválido.");
  }
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  return /^Bearer\s+(\S+)$/i.exec(authorization)?.[1] ?? "";
}

function normalizeRpcRow(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeTeamContext(value: unknown): TeamContext | null {
  const context = normalizeRpcRow(value);
  if (
    !isRecord(context) ||
    typeof context.account_id !== "string" ||
    typeof context.actor_user_id !== "string" ||
    !isRole(context.role) ||
    typeof context.account_name !== "string" ||
    typeof context.can_manage_team !== "boolean"
  ) {
    return null;
  }

  return {
    account_id: context.account_id,
    actor_user_id: context.actor_user_id,
    role: context.role,
    permissions: getFallbackPermissionsForRole(context.role),
    display_name:
      typeof context.display_name === "string" && context.display_name.trim()
        ? context.display_name.trim()
        : "Usuário",
    account_name: context.account_name,
    can_manage_team: context.can_manage_team,
  };
}

function normalizePermissionRpcResult(value: unknown, role: TeamRole) {
  if (role === "owner" || role === "admin") return [...TEAM_PERMISSIONS];
  if (!Array.isArray(value) || value.some((permission) => !isTeamPermission(permission))) {
    return null;
  }

  return TEAM_PERMISSIONS.filter((permission) => value.includes(permission));
}

async function authenticateTeamRequest(request: Request): Promise<AuthenticatedTeamRequest> {
  if (!isSupabaseConfigured()) {
    throw requestError(503, "Supabase não configurado.");
  }

  const token = getBearerToken(request);
  if (!token) throw requestError(401, "Sessão obrigatória.");

  const supabase = createSupabaseClientForAccessToken(token);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    throw requestError(401, "Sessão inválida ou expirada.");
  }

  const { data, error } = await supabase.rpc("get_current_account_context");
  if (error) throw requestError(403, "Você não possui acesso a esta conta.");

  const context = normalizeTeamContext(data);
  if (!context || context.actor_user_id !== userData.user.id) {
    throw requestError(403, "Você não possui acesso a esta conta.");
  }

  const { data: permissionsData, error: permissionsError } = await supabase.rpc(
    "get_current_account_permissions",
  );
  const permissions = normalizePermissionRpcResult(permissionsData, context.role);
  if (permissionsError || !permissions) {
    throw requestError(403, "Não foi possível confirmar suas permissões de acesso.");
  }

  const contextWithPermissions: TeamContext = {
    ...context,
    permissions,
    can_manage_team:
      context.role === "owner" ||
      context.role === "admin" ||
      permissions.includes("team.manage"),
  };

  if (!contextWithPermissions.can_manage_team) {
    throw requestError(403, "Você não possui permissão para gerenciar usuários.");
  }

  return { supabase, context: contextWithPermissions };
}

function getAdminClient() {
  const { url } = getSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!url || !serviceRoleKey) {
    throw requestError(503, "Administração de usuários não configurada.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function databaseErrorMessage(error: unknown, fallback: string) {
  if (!isRecord(error)) return fallback;
  const text = [error.code, error.message, error.details, error.hint]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();

  if (text.includes("permission") || text.includes("forbidden") || text.includes("42501")) {
    return "Você não possui permissão para gerenciar usuários.";
  }
  if (text.includes("already") || text.includes("duplicate") || text.includes("23505")) {
    return "Este e-mail já está cadastrado.";
  }
  if (text.includes("lote aberto antes de remover")) {
    return "Finalize ou cancele o lote aberto antes de remover o acesso deste usuário.";
  }
  if (text.includes("finalize ou cancele o lote aberto")) {
    return "Finalize ou cancele o lote aberto antes de retirar a permissão de bipagem deste usuário.";
  }
  if (text.includes("proprio acesso")) {
    return "Você não pode remover o seu próprio acesso.";
  }
  if (text.includes("proprietario da conta")) {
    return "O acesso do proprietário da conta não pode ser removido.";
  }
  if (text.includes("membro nao encontrado")) {
    return "Usuário não encontrado nesta equipe.";
  }
  return fallback;
}

async function getTeamTargetMember(
  supabase: SupabaseClient,
  targetUserId: string,
) {
  const { data, error } = await supabase.rpc("list_team_admin_snapshot_v2");
  if (error) {
    throw requestError(403, "Você não possui permissão para alterar este usuário.");
  }

  const snapshot = normalizeRpcRow(data);
  const members = isRecord(snapshot) && Array.isArray(snapshot.members)
    ? snapshot.members
    : [];
  const target = members.find(
    (member) => isRecord(member) && member.user_id === targetUserId,
  );

  if (!isRecord(target)) {
    throw requestError(404, "Usuário não encontrado nesta equipe.");
  }

  return target;
}

function assertNonOwnerCanManageMember(
  target: Record<string, unknown>,
  nextPermissions: readonly TeamPermission[],
) {
  const targetPermissions = Array.isArray(target.permissions)
    ? target.permissions.filter(isTeamPermission)
    : [];
  if (
    target.role === "admin" ||
    target.role === "owner" ||
    targetPermissions.includes("team.manage") ||
    nextPermissions.includes("team.manage")
  ) {
    throw requestError(403, "Somente o proprietário pode gerenciar outros responsáveis pelos acessos.");
  }
}

function errorResponse(error: unknown) {
  const status =
    isRecord(error) && typeof error.status === "number" && error.status >= 400 && error.status <= 599
      ? error.status
      : 500;
  const message = error instanceof Error ? error.message : "Não foi possível processar a solicitação.";
  return NextResponse.json({ ok: false, message }, { status });
}

export async function GET(request: Request) {
  try {
    const { supabase } = await authenticateTeamRequest(request);
    const { data, error } = await supabase.rpc("list_team_admin_snapshot_v2");

    if (error) {
      throw requestError(403, databaseErrorMessage(error, "Não foi possível carregar a equipe."));
    }

    const snapshot = normalizeRpcRow(data);
    if (!isRecord(snapshot)) throw requestError(500, "O banco retornou dados de equipe inválidos.");

    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let createdUserId = "";
  let adminClient: ReturnType<typeof getAdminClient> | null = null;

  try {
    const { supabase, context } = await authenticateTeamRequest(request);
    const body = await readJsonBody(request);
    if (!isRecord(body) || !hasExactKeys(body, ["name", "email", "password", "permissions"])) {
      throw requestError(400, "Dados do usuário inválidos.");
    }

    const name = normalizeName(body.name);
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 8 || password.length > 128) {
      throw requestError(400, "A senha inicial deve ter entre 8 e 128 caracteres.");
    }
    const permissions = normalizePermissions(body.permissions);
    if (context.role !== "owner" && permissions.includes("team.manage")) {
      throw requestError(403, "Somente o proprietário pode liberar o gerenciamento de usuários.");
    }

    adminClient = getAdminClient();
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
      app_metadata: { team_account_id: context.account_id },
    });

    if (createError || !created.user) {
      throw requestError(409, databaseErrorMessage(createError, "Não foi possível criar o login do usuário."));
    }

    createdUserId = created.user.id;
    const { error: membershipError } = await supabase.rpc("add_account_member_v2", {
      p_user_id: createdUserId,
      p_email: email,
      p_display_name: name,
      p_permissions: permissions,
      p_role: "operator",
    });

    if (membershipError) {
      const { error: rollbackError } = await adminClient.auth.admin.deleteUser(createdUserId);
      if (rollbackError) {
        throw requestError(500, "O login foi criado, mas não foi vinculado à equipe. Contate o administrador antes de tentar novamente.");
      }
      createdUserId = "";
      throw requestError(400, databaseErrorMessage(membershipError, "Não foi possível vincular o usuário à equipe."));
    }

    return NextResponse.json({ ok: true, userId: createdUserId }, { status: 201 });
  } catch (error) {
    if (createdUserId && adminClient) {
      await adminClient.auth.admin.deleteUser(createdUserId).catch(() => undefined);
    }
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, context } = await authenticateTeamRequest(request);
    const body = await readJsonBody(request);
    if (!isRecord(body) || !hasExactKeys(body, ["userId", "name", "permissions", "status"])) {
      throw requestError(400, "Dados da atualização inválidos.");
    }

    if (typeof body.userId !== "string" || !UUID_PATTERN.test(body.userId)) {
      throw requestError(400, "Usuário inválido.");
    }
    const name = normalizeName(body.name);
    const permissions = normalizePermissions(body.permissions);
    if (!isStatus(body.status)) {
      throw requestError(400, "Situação inválida.");
    }

    const target = await getTeamTargetMember(supabase, body.userId);
    if (context.role !== "owner") {
      assertNonOwnerCanManageMember(target, permissions);
    }

    const nextRole =
      target.role === "admin" &&
      !TEAM_PERMISSIONS.every((permission) => permissions.includes(permission))
        ? "operator"
        : null;

    const { error } = await supabase.rpc("update_account_member_v2", {
      p_user_id: body.userId,
      p_display_name: name,
      p_permissions: permissions,
      p_role: nextRole,
      p_status: body.status,
    });

    if (error) {
      throw requestError(400, databaseErrorMessage(error, "Não foi possível atualizar o usuário."));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, context } = await authenticateTeamRequest(request);
    const body = await readJsonBody(request);
    if (!isRecord(body) || !hasExactKeys(body, ["userId"])) {
      throw requestError(400, "Dados da remoção inválidos.");
    }
    if (typeof body.userId !== "string" || !UUID_PATTERN.test(body.userId)) {
      throw requestError(400, "Usuário inválido.");
    }

    const target = await getTeamTargetMember(supabase, body.userId);
    if (context.role !== "owner") {
      assertNonOwnerCanManageMember(target, []);
    }

    const { error } = await supabase.rpc("remove_account_member_v2", {
      p_user_id: body.userId,
    });

    if (error) {
      throw requestError(400, databaseErrorMessage(error, "Não foi possível remover o acesso do usuário."));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
