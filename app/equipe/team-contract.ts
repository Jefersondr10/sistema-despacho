export const TEAM_ROLES = [
  "owner",
  "admin",
  "supervisor",
  "operator",
  "viewer",
] as const;

export const TEAM_MEMBER_STATUSES = ["active", "suspended"] as const;

export const TEAM_PERMISSIONS = [
  "dashboard.view",
  "bipagem.manage",
  "pacotes.view",
  "cancelamentos.view",
  "cancelamentos.manage",
  "relatorios.view",
  "relatorios.send",
  "cadastros.view",
  "cadastros.manage",
  "team.manage",
] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];
export type TeamMemberStatus = (typeof TEAM_MEMBER_STATUSES)[number];
export type TeamPermission = (typeof TEAM_PERMISSIONS)[number];

export type TeamContext = {
  account_id: string;
  actor_user_id: string;
  role: TeamRole;
  permissions: TeamPermission[];
  display_name: string;
  account_name: string;
  can_manage_team: boolean;
};

export type TeamMember = {
  user_id: string;
  display_name: string;
  email: string;
  role: TeamRole;
  permissions: TeamPermission[];
  status: TeamMemberStatus;
  created_at: string;
  updated_at: string | null;
  last_activity_at: string | null;
};

export type TeamActivity = {
  id: string;
  actor_user_id: string | null;
  actor_display_name: string;
  action: string;
  entity_type: string;
  description: string;
  occurred_at: string;
};

export type TeamAdminSnapshot = {
  context: TeamContext;
  members: TeamMember[];
  activities: TeamActivity[];
};

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  supervisor: "Supervisor",
  operator: "Operador",
  viewer: "Somente consulta",
};

export const TEAM_STATUS_LABELS: Record<TeamMemberStatus, string> = {
  active: "Ativo",
  suspended: "Suspenso",
};

export const TEAM_PERMISSION_LABELS: Record<TeamPermission, string> = {
  "dashboard.view": "Ver o Dashboard",
  "bipagem.manage": "Bipar e finalizar pacotes",
  "pacotes.view": "Consultar pacotes",
  "cancelamentos.view": "Consultar cancelamentos",
  "cancelamentos.manage": "Cancelar pacotes",
  "relatorios.view": "Ver e imprimir relatórios",
  "relatorios.send": "Enviar relatórios por e-mail",
  "cadastros.view": "Ver cadastros",
  "cadastros.manage": "Gerenciar cadastros",
  "team.manage": "Gerenciar usuários e acessos",
};

export const TEAM_PERMISSION_DESCRIPTIONS: Record<TeamPermission, string> = {
  "dashboard.view": "Acompanhar os indicadores e os últimos pacotes da operação.",
  "bipagem.manage": "Iniciar lotes, bipar códigos, remover leituras e finalizar a bipagem.",
  "pacotes.view": "Pesquisar e conferir o histórico de pacotes bipados.",
  "cancelamentos.view": "Consultar o histórico e as justificativas de cancelamento.",
  "cancelamentos.manage": "Cancelar pacotes e registrar as respectivas justificativas.",
  "relatorios.view": "Aplicar filtros, consultar romaneios e gerar impressão ou PDF.",
  "relatorios.send": "Enviar os relatórios aos destinatários cadastrados.",
  "cadastros.view": "Consultar lojas, marketplaces, transportadoras e destinatários.",
  "cadastros.manage": "Cadastrar, editar, ativar, inativar e excluir cadastros.",
  "team.manage": "Criar logins, suspender usuários e definir o que cada pessoa pode fazer.",
};

export const TEAM_PERMISSION_DEPENDENCIES: Partial<
  Record<TeamPermission, readonly TeamPermission[]>
> = {
  "cancelamentos.manage": [
    "bipagem.manage",
    "cancelamentos.view",
    "pacotes.view",
  ],
  "relatorios.send": ["relatorios.view"],
  "cadastros.manage": ["cadastros.view"],
};

const TEAM_PERMISSION_SET = new Set<string>(TEAM_PERMISSIONS);

export function isTeamPermission(value: unknown): value is TeamPermission {
  return typeof value === "string" && TEAM_PERMISSION_SET.has(value);
}

export function resolveTeamPermissionDependencies(
  values: readonly TeamPermission[],
) {
  const selected = new Set<TeamPermission>(values);
  let changed = true;

  while (changed) {
    changed = false;
    for (const permission of selected) {
      for (const dependency of TEAM_PERMISSION_DEPENDENCIES[permission] ?? []) {
        if (!selected.has(dependency)) {
          selected.add(dependency);
          changed = true;
        }
      }
    }
  }

  return TEAM_PERMISSIONS.filter((permission) => selected.has(permission));
}

function permissionDependsOn(
  permission: TeamPermission,
  dependency: TeamPermission,
  visited = new Set<TeamPermission>(),
): boolean {
  if (visited.has(permission)) return false;
  visited.add(permission);

  return (TEAM_PERMISSION_DEPENDENCIES[permission] ?? []).some(
    (candidate) =>
      candidate === dependency ||
      permissionDependsOn(candidate, dependency, visited),
  );
}

export function toggleTeamPermission(
  current: readonly TeamPermission[],
  permission: TeamPermission,
  checked: boolean,
) {
  if (checked) {
    return resolveTeamPermissionDependencies([...current, permission]);
  }

  return TEAM_PERMISSIONS.filter(
    (candidate) =>
      current.includes(candidate) &&
      candidate !== permission &&
      !permissionDependsOn(candidate, permission),
  );
}

export const TEAM_ROLE_FALLBACK_PERMISSIONS: Record<
  TeamRole,
  readonly TeamPermission[]
> = {
  owner: TEAM_PERMISSIONS,
  admin: TEAM_PERMISSIONS,
  supervisor: TEAM_PERMISSIONS.filter(
    (permission) => permission !== "team.manage",
  ),
  operator: TEAM_PERMISSIONS.filter(
    (permission) => permission !== "team.manage",
  ),
  viewer: [
    "dashboard.view",
    "pacotes.view",
    "cancelamentos.view",
    "relatorios.view",
    "cadastros.view",
  ],
};

export function getFallbackPermissionsForRole(role: TeamRole) {
  return [...TEAM_ROLE_FALLBACK_PERMISSIONS[role]];
}

export function hasTeamPermission(
  context: Pick<TeamContext, "role" | "permissions"> | null | undefined,
  permission: TeamPermission,
) {
  return context?.role === "owner" || Boolean(context?.permissions.includes(permission));
}

export const TEAM_ROUTE_PERMISSION_RULES = [
  { pathname: "/dashboard", permission: "dashboard.view" },
  { pathname: "/bipagem", permission: "bipagem.manage" },
  { pathname: "/pacotes-cancelados", permission: "cancelamentos.view" },
  { pathname: "/pacotes", permission: "pacotes.view" },
  { pathname: "/relatorios", permission: "relatorios.view" },
  { pathname: "/romaneio", permission: "relatorios.view" },
  { pathname: "/cadastros", permission: "cadastros.view" },
  { pathname: "/equipe", permission: "team.manage" },
] as const satisfies readonly {
  pathname: string;
  permission: TeamPermission;
}[];

export function getRequiredPermissionForPathname(pathname: string) {
  return TEAM_ROUTE_PERMISSION_RULES.find(
    (rule) =>
      pathname === rule.pathname || pathname.startsWith(`${rule.pathname}/`),
  )?.permission ?? null;
}

export function canAccessTeamPathname(
  pathname: string,
  context: Pick<TeamContext, "role" | "permissions"> | null | undefined,
) {
  const permission = getRequiredPermissionForPathname(pathname);
  return permission ? hasTeamPermission(context, permission) : true;
}

export function getFirstAllowedTeamRoute(
  context: Pick<TeamContext, "role" | "permissions"> | null | undefined,
) {
  return (
    TEAM_ROUTE_PERMISSION_RULES.find((rule) =>
      hasTeamPermission(context, rule.permission),
    )?.pathname ?? "/feedback"
  );
}
