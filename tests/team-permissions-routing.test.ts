import assert from "node:assert/strict";
import test from "node:test";

import {
  TEAM_PERMISSIONS,
  canAccessTeamPathname,
  getFallbackPermissionsForRole,
  getFirstAllowedTeamRoute,
  resolveTeamPermissionDependencies,
  toggleTeamPermission,
  type TeamPermission,
} from "../app/equipe/team-contract.ts";

function context(
  permissions: TeamPermission[],
  role: "owner" | "operator" = "operator",
) {
  return { permissions, role };
}

test("contrato expõe exatamente as dez permissões do banco", () => {
  assert.deepEqual(TEAM_PERMISSIONS, [
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
  ]);
});

test("dependências são marcadas e removidas junto com a permissão principal", () => {
  assert.deepEqual(resolveTeamPermissionDependencies(["cancelamentos.manage"]), [
    "bipagem.manage",
    "pacotes.view",
    "cancelamentos.view",
    "cancelamentos.manage",
  ]);
  assert.deepEqual(resolveTeamPermissionDependencies(["relatorios.send"]), [
    "relatorios.view",
    "relatorios.send",
  ]);
  assert.deepEqual(resolveTeamPermissionDependencies(["cadastros.manage"]), [
    "cadastros.view",
    "cadastros.manage",
  ]);

  const cancellationAccess = resolveTeamPermissionDependencies([
    "dashboard.view",
    "cancelamentos.manage",
  ]);
  assert.deepEqual(
    toggleTeamPermission(cancellationAccess, "pacotes.view", false),
    ["dashboard.view", "bipagem.manage", "cancelamentos.view"],
  );
  assert.deepEqual(
    toggleTeamPermission(
      ["dashboard.view", "relatorios.view", "relatorios.send"],
      "relatorios.view",
      false,
    ),
    ["dashboard.view"],
  );
});

test("fallback por perfil preserva o acesso legado sem expor perfis na tela", () => {
  assert.deepEqual(getFallbackPermissionsForRole("owner"), TEAM_PERMISSIONS);
  assert.deepEqual(getFallbackPermissionsForRole("admin"), TEAM_PERMISSIONS);
  assert.equal(
    getFallbackPermissionsForRole("operator").includes("team.manage"),
    false,
  );
  assert.deepEqual(getFallbackPermissionsForRole("viewer"), [
    "dashboard.view",
    "pacotes.view",
    "cancelamentos.view",
    "relatorios.view",
    "cadastros.view",
  ]);
});

test("menu, URL direta e destino inicial respeitam as permissões", () => {
  const reportOnly = context(["relatorios.view"]);
  assert.equal(canAccessTeamPathname("/relatorios", reportOnly), true);
  assert.equal(canAccessTeamPathname("/romaneio/lote-1", reportOnly), true);
  assert.equal(canAccessTeamPathname("/bipagem", reportOnly), false);
  assert.equal(canAccessTeamPathname("/feedback", reportOnly), true);
  assert.equal(getFirstAllowedTeamRoute(reportOnly), "/relatorios");

  const noOperationalAccess = context([]);
  assert.equal(getFirstAllowedTeamRoute(noOperationalAccess), "/feedback");
  assert.equal(canAccessTeamPathname("/feedback", noOperationalAccess), true);

  const owner = context([], "owner");
  assert.equal(canAccessTeamPathname("/equipe", owner), true);
  assert.equal(getFirstAllowedTeamRoute(owner), "/dashboard");
});
