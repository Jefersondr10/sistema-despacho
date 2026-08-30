export type MarketplaceBrand = "amazon" | "mercado-livre" | "shopee";

function normalizeMarketplaceName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isBrandName(value: string, brandName: string) {
  return value === brandName || value.startsWith(`${brandName} `);
}

export function resolveMarketplaceBrand(
  marketplaceName: string,
): MarketplaceBrand | null {
  const normalizedName = normalizeMarketplaceName(marketplaceName);

  if (isBrandName(normalizedName, "amazon")) {
    return "amazon";
  }

  if (
    isBrandName(normalizedName, "mercado livre") ||
    isBrandName(normalizedName, "mercado libre")
  ) {
    return "mercado-livre";
  }

  if (isBrandName(normalizedName, "shopee")) {
    return "shopee";
  }

  return null;
}
