import type { DispatchPackage, Store } from "./mock-data.ts";

export type RomaneioGroup = {
  id: string;
  loja_nome: string;
  marketplaces: string[];
  periodo: string;
  pacotes: DispatchPackage[];
};

type MutableRomaneioGroup = Omit<RomaneioGroup, "marketplaces"> & {
  marketplaces: Set<string>;
};

export function groupRomaneioPackagesByStore(
  packages: DispatchPackage[],
  stores: Store[],
  periodo: string,
): RomaneioGroup[] {
  const storeNames = new Map(stores.map((store) => [store.id, store.name]));
  const grouped = new Map<string, MutableRomaneioGroup>();
  const periodLabel = periodo.trim() || "Não informado";

  for (const item of packages) {
    if (item.status === "Cancelado") {
      continue;
    }

    const marketplace = item.marketplace.trim();
    const current = grouped.get(item.loja_id);

    if (current) {
      current.pacotes.push(item);
      if (marketplace) {
        current.marketplaces.add(marketplace);
      }
      continue;
    }

    grouped.set(item.loja_id, {
      id: item.loja_id,
      loja_nome: storeNames.get(item.loja_id) ?? item.loja_id,
      marketplaces: new Set(marketplace ? [marketplace] : []),
      periodo: periodLabel,
      pacotes: [item],
    });
  }

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      marketplaces: Array.from(group.marketplaces).sort((first, second) =>
        first.localeCompare(second, "pt-BR"),
      ),
    }))
    .sort(
      (first, second) =>
        first.loja_nome.localeCompare(second.loja_nome, "pt-BR") ||
        first.id.localeCompare(second.id),
    );
}
