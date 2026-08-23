type RomaneioIdentity = {
  loteId: string;
  lojaId: string;
  marketplaceId?: string | null;
  marketplaceName: string;
};

function normalizedIdentityPart(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("pt-BR");
}

export function getRomaneioGroupId({
  loteId,
  lojaId,
  marketplaceId,
  marketplaceName,
}: RomaneioIdentity) {
  const normalizedBatchId = loteId.trim();
  const normalizedStoreId = lojaId.trim();
  const normalizedMarketplaceId = marketplaceId?.trim();

  if (!normalizedBatchId || !normalizedStoreId) {
    throw new Error("Lote e loja são obrigatórios para separar o romaneio.");
  }

  const marketplaceIdentity = normalizedMarketplaceId
    ? `id:${normalizedMarketplaceId}`
    : `nome:${normalizedIdentityPart(marketplaceName)}`;

  if (marketplaceIdentity === "nome:") {
    throw new Error("Marketplace obrigatório para separar o romaneio.");
  }

  return `${normalizedBatchId}::${normalizedStoreId}::${marketplaceIdentity}`;
}
