"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  TEAM_PERMISSIONS,
  TEAM_ROLES,
  getFallbackPermissionsForRole,
  isTeamPermission,
  type TeamContext,
  type TeamPermission,
  type TeamRole,
} from "@/app/equipe/team-contract";
import { useAuth } from "@/app/_lib/auth-context";
import { getSupabaseClient } from "@/lib/supabaseClient";

type TeamContextValue = {
  context: TeamContext | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const TeamAccessContext = createContext<TeamContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRole(value: unknown): value is TeamRole {
  return typeof value === "string" && TEAM_ROLES.includes(value as TeamRole);
}

function normalizeContext(value: unknown): TeamContext | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (
    !isRecord(candidate) ||
    typeof candidate.account_id !== "string" ||
    typeof candidate.actor_user_id !== "string" ||
    !isRole(candidate.role) ||
    typeof candidate.account_name !== "string" ||
    typeof candidate.can_manage_team !== "boolean"
  ) {
    return null;
  }

  return {
    account_id: candidate.account_id,
    actor_user_id: candidate.actor_user_id,
    role: candidate.role,
    permissions: getFallbackPermissionsForRole(candidate.role),
    display_name:
      typeof candidate.display_name === "string" && candidate.display_name.trim()
        ? candidate.display_name.trim()
        : "Usuário",
    account_name: candidate.account_name,
    can_manage_team: candidate.can_manage_team,
  };
}

function normalizePermissions(value: unknown, role: TeamRole) {
  if (role === "owner" || role === "admin") return [...TEAM_PERMISSIONS];

  const candidate = Array.isArray(value) ? value : null;
  if (!candidate || candidate.some((permission) => !isTeamPermission(permission))) {
    return null;
  }

  return TEAM_PERMISSIONS.filter((permission) => candidate.includes(permission));
}

function isMissingTeamContextRpc(error: unknown) {
  if (!isRecord(error)) return false;
  const code = typeof error.code === "string" ? error.code.toUpperCase() : "";
  const text = [error.message, error.details, error.hint]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();

  return (
    code === "PGRST202" ||
    code === "42883" ||
    (text.includes("get_current_account_context") &&
      (text.includes("not find") ||
        text.includes("does not exist") ||
        text.includes("schema cache")))
  );
}

function isMissingTeamPermissionsRpc(error: unknown) {
  if (!isRecord(error)) return false;
  const code = typeof error.code === "string" ? error.code.toUpperCase() : "";
  const text = [error.message, error.details, error.hint]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();

  return (
    code === "PGRST202" ||
    code === "42883" ||
    (text.includes("get_current_account_permissions") &&
      (text.includes("not find") ||
        text.includes("does not exist") ||
        text.includes("schema cache")))
  );
}

function getLegacyOwnerContext(
  user: NonNullable<ReturnType<typeof useAuth>["user"]>,
): TeamContext {
  const metadataName =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name.trim()
      : "";
  const email = user.email?.trim() || "Conta ativa";

  return {
    account_id: user.id,
    actor_user_id: user.id,
    role: "owner",
    permissions: [...TEAM_PERMISSIONS],
    display_name: metadataName || email,
    account_name: "Minha operação",
    can_manage_team: true,
  };
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const { configured, loading: authLoading, user } = useAuth();
  const [context, setContext] = useState<TeamContext | null>(null);
  const [loading, setLoading] = useState(Boolean(configured));
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (authLoading) return;

    if (!configured || !user) {
      setContext(null);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const supabase = getSupabaseClient();
    const { data, error: contextError } = await supabase.rpc(
      "get_current_account_context",
    );

    if (contextError && isMissingTeamContextRpc(contextError)) {
      setContext(getLegacyOwnerContext(user));
      setLoading(false);
      return;
    }

    if (contextError) {
      setContext(null);
      setError("Não foi possível confirmar seu acesso à equipe.");
      setLoading(false);
      return;
    }

    const normalized = normalizeContext(data);
    if (!normalized || normalized.actor_user_id !== user.id) {
      setContext(null);
      setError("O contexto da sua conta é inválido. Entre novamente.");
      setLoading(false);
      return;
    }

    const { data: permissionsData, error: permissionsError } = await supabase.rpc(
      "get_current_account_permissions",
    );

    const permissions = permissionsError && isMissingTeamPermissionsRpc(permissionsError)
      ? getFallbackPermissionsForRole(normalized.role)
      : normalizePermissions(permissionsData, normalized.role);

    if (permissionsError && !isMissingTeamPermissionsRpc(permissionsError)) {
      setContext(null);
      setError("Não foi possível confirmar suas permissões de acesso.");
      setLoading(false);
      return;
    }

    if (!permissions) {
      setContext(null);
      setError("As permissões da sua conta são inválidas. Entre novamente.");
      setLoading(false);
      return;
    }

    setContext({
      ...normalized,
      permissions,
      can_manage_team:
        normalized.role === "owner" ||
        normalized.role === "admin" ||
        permissions.includes("team.manage" satisfies TeamPermission),
    });
    setLoading(false);
  }, [authLoading, configured, user]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) void refresh();
    });

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const value = useMemo<TeamContextValue>(
    () => ({ context, loading, error, refresh }),
    [context, error, loading, refresh],
  );

  return (
    <TeamAccessContext.Provider value={value}>
      {children}
    </TeamAccessContext.Provider>
  );
}

export function useTeam() {
  const context = useContext(TeamAccessContext);
  if (!context) {
    throw new Error("useTeam deve ser usado dentro de TeamProvider.");
  }
  return context;
}
