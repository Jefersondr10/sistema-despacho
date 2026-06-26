import type { DispatchPackage, OperationType } from "@/app/_lib/mock-data";
import { formatPackageDate, getOperationLabel } from "@/app/_lib/mock-data";

export type RomaneioGroup = {
  id: string;
  codigo_lote: string;
  loja_nome: string;
  marketplace: string;
  tipo_operacao: OperationType;
  melhor_envio: boolean;
  transportadora: string | null;
  data: string;
  pacotes: DispatchPackage[];
};

function manualDateMask() {
  return "____/____/______";
}

export function RomaneioDocument({
  groups,
  totalLabel,
}: {
  groups: RomaneioGroup[];
  totalLabel?: string;
}) {
  const totalPacotes = groups.reduce(
    (total, group) => total + group.pacotes.length,
    0,
  );

  return (
    <div className="romaneio-document grid gap-6 bg-white text-slate-950 print:block">
      {totalLabel ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700 print:border-0 print:bg-white print:p-0">
          {totalLabel}: {totalPacotes} pacotes
        </div>
      ) : null}

      {groups.map((group, groupIndex) => (
        <article
          key={group.id}
          className="romaneio-sheet rounded-lg border border-slate-200 bg-white p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none"
        >
          <header className="border-b border-slate-300 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Sistema de despacho
                </p>
                <h1 className="mt-2 text-2xl font-semibold text-slate-950">
                  ROMANEIO DE ENTREGA / COLETA
                </h1>
              </div>
              <div className="rounded-md border border-slate-300 px-3 py-2 text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Codigo do lote
                </p>
                <p className="font-mono text-lg font-semibold">
                  {group.codigo_lote}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <span className="font-semibold">Loja:</span> {group.loja_nome}
              </p>
              <p>
                <span className="font-semibold">Marketplace:</span>{" "}
                {group.marketplace}
              </p>
              <p>
                <span className="font-semibold">Tipo de operacao:</span>{" "}
                {getOperationLabel(group.tipo_operacao)}
              </p>
              <p>
                <span className="font-semibold">Melhor Envio:</span>{" "}
                {group.melhor_envio ? "Sim" : "Nao"}
              </p>
              <p>
                <span className="font-semibold">Transportadora:</span>{" "}
                {group.transportadora || "Sem transportadora"}
              </p>
              <p>
                <span className="font-semibold">Bipagem/finalizacao:</span>{" "}
                {formatPackageDate(group.data)}
              </p>
              <p className="sm:col-span-2">
                <span className="font-semibold">Data:</span> {manualDateMask()}
              </p>
            </div>
          </header>

          <section className="mt-5">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 text-left print:bg-white">
                  <th className="w-16 border border-slate-300 px-3 py-2 font-semibold">
                    No
                  </th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold">
                    Codigo/rastreio do pacote
                  </th>
                  <th className="border border-slate-300 px-3 py-2 font-semibold">
                    Observacao
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.pacotes.map((item, index) => (
                  <tr key={item.id}>
                    <td className="border border-slate-300 px-3 py-2">
                      {index + 1}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 font-mono font-semibold">
                      {item.codigo_rastreio}
                    </td>
                    <td className="border border-slate-300 px-3 py-2" />
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
            <div className="rounded-md border border-slate-300 p-4">
              <p className="font-semibold">Quem entrega</p>
              <p className="mt-5">Nome: ______________________________</p>
              <p className="mt-4">Documento: __________________________</p>
              <p className="mt-8">Assinatura: _________________________</p>
            </div>
            <div className="rounded-md border border-slate-300 p-4">
              <p className="font-semibold">Quem coleta/recebe</p>
              <p className="mt-5">Nome: ______________________________</p>
              <p className="mt-4">Documento: __________________________</p>
              <p className="mt-8">Assinatura: _________________________</p>
            </div>
          </section>

          <p className="mt-6 border-t border-slate-300 pt-4 text-sm leading-6">
            Declaro que os pacotes listados neste romaneio foram
            entregues/recebidos conforme relacao acima.
          </p>

          {groupIndex < groups.length - 1 ? (
            <div className="romaneio-page-break" />
          ) : null}
        </article>
      ))}
    </div>
  );
}
