import { RomaneioLoteView } from "./romaneio-lote-view";

export default async function RomaneioLotePage({
  params,
}: {
  params: Promise<{ loteId: string }>;
}) {
  const { loteId } = await params;

  return <RomaneioLoteView loteId={loteId} />;
}
