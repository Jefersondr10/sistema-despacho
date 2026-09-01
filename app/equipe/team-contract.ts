export const TEAM_ROLES = [
  "owner",
  "admin",
  "supervisor",
  "operator",
  "viewer",
] as const;

export const TEAM_MEMBER_STATUSES = ["active", "suspended"] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];
export type TeamMemberStatus = (typeof TEAM_MEMBER_STATUSES)[number];

export type TeamContext = {
  account_id: string;
  actor_user_id: string;
  role: TeamRole;
  display_name: string;
  account_name: string;
  can_manage_team: boolean;
};

export type TeamMember = {
  user_id: string;
  display_name: string;
  email: string;
  role: TeamRole;
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

