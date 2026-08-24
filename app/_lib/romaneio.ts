import type { DispatchPackage, Store } from "./mock-data.ts";

export type RomaneioGroup = {
  id: string;
  loja_id: string;
  loja_nome: string;
  marketplace_id: string | null;
  marketplace: string;
  periodo: string;
  pacotes: DispatchPackage[];
};

type MarketplaceIdentity = {
  id: string | null;
  key: string;
  name: string;
};

function normalizeIdentityPart(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("pt-BR");
}

function getMarketplaceIdentity(item: DispatchPackage): MarketplaceIdentity {
  const marketplaceId = item.marketplace_id?.trim() || null;
  const marketplaceName = item.marketplace.trim() || "Não informado";

  return {
    id: marketplaceId,
    key: marketplaceId
      ? `id:${marketplaceId}`
      : `nome:${normalizeIdentityPart(marketplaceName)}`,
    name: marketplaceName,
  };
}
export function groupRomaneioPackagesByStoreAndMarketplace(
  packages: DispatchPackage[],
  stores: Store[],
  periodo: string,
): RomaneioGroup[] {
  const storeNames = new Map(stores.map((store) => [store.id, store.name]));
  const grouped = new Map<string, RomaneioGroup>();
  const periodLabel = periodo.trim() || "Não informado";

  for (const item of packages) {
    if (item.status === "Cancelado") {
      continue;
    }

    const marketplace = getMarketplaceIdentity(item);
    const groupId = `${item.loja_id}::${marketplace.key}`;
    const current = grouped.get(groupId);

    if (current) {
      current.pacotes.push(item);
      continue;
    }

    grouped.set(groupId, {
      id: groupId,
      loja_id: item.loja_id,
      loja_nome: storeNames.get(item.loja_id) ?? item.loja_id,
      marketplace_id: marketplace.id,
      marketplace: marketplace.name,
      periodo: periodLabel,
      pacotes: [item],
    });
  }

  return Array.from(grouped.values())
    .sort(
      (first, second) =>
        first.loja_nome.localeCompare(second.loja_nome, "pt-BR") ||
        first.marketplace.localeCompare(second.marketplace, "pt-BR") ||
        first.id.localeCompare(second.id),
    );
}
