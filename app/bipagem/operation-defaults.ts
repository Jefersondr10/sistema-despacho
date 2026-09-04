import type { OperationType } from "@/app/_lib/mock-data";
import type { RegraOperacaoBipagemRow } from "@/lib/database";

export type OperationSelectionSource = "none" | "default" | "manual";

export function findOperationDefault(
  rules: readonly RegraOperacaoBipagemRow[],
  storeId: string,
  marketplaceId: string,
) {
  if (!storeId || !marketplaceId) return null;

  return (
    rules.find(
      (rule) =>
        rule.loja_id === storeId &&
        rule.marketplace_id === marketplaceId,
    ) ?? null
  );
}

export function getOperationDefault(
  rules: readonly RegraOperacaoBipagemRow[],
  storeId: string,
  marketplaceId: string,
): OperationType | "" {
  return findOperationDefault(rules, storeId, marketplaceId)?.tipo_operacao ?? "";
}
