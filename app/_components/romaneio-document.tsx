import type { DispatchPackage, OperationType } from "@/app/_lib/mock-data";
import { formatPackageDate } from "@/app/_lib/mock-data";

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

const LONG_TRACKING_CODE_LENGTH = 18;

function getTrackingColumnCount(packages: DispatchPackage[]) {
  const hasLongTrackingCode = packages.some(
    (item) => item.codigo_rastreio.trim().length > LONG_TRACKING_CODE_LENGTH,
  );

  return hasLongTrackingCode ? 4 : 5;
}

function RomaneioSheet({ group }: { group: RomaneioGroup }) {
  const trackingColumnCount = getTrackingColumnCount(group.pacotes);

  return (
    <article className="romaneio-sheet rounded-xl border border-slate-200 bg-white p-5 text-slate-950 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <div className="border-b-2 border-slate-900 pb-4 print:pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Sistema de despacho
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl print:text-xl">
              Romaneio de pacotes
            </h1>
          </div>
          <div className="min-w-36 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-right print:bg-white">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Lote
            </p>
            <p className="font-mono text-sm font-bold sm:text-base">
              {group.codigo_lote}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] print:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <div className="rounded-xl bg-slate-900 px-4 py-3 text-white print:border-2 print:border-slate-900 print:bg-white print:text-slate-950">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300 print:text-slate-500">
              Loja
            </p>
            <p className="mt-1 text-xl font-extrabold leading-tight tracking-tight sm:text-2xl print:text-xl">
              {group.loja_nome}
            </p>
          </div>
          <div className="rounded-xl border-2 border-teal-600 bg-teal-50 px-4 py-3 print:bg-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">
              Marketplace
            </p>
            <p className="mt-1 text-lg font-extrabold leading-tight text-teal-950 sm:text-xl print:text-lg">
              {group.marketplace}
            </p>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 print:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 print:border-slate-300 print:bg-white">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Data e hora
            </p>
            <p className="mt-0.5 text-sm font-bold">
              {formatPackageDate(group.data)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 print:border-slate-300 print:bg-white">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Total de pacotes
            </p>
            <p className="mt-0.5 text-sm font-extrabold text-slate-950">
              {group.pacotes.length}{" "}
              {group.pacotes.length === 1 ? "pacote" : "pacotes"}
            </p>
          </div>
        </div>
      </div>

      <section className="mt-4 print:mt-3">
        <div className="mb-2 flex items-end justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
            Rastreios
          </h2>
          <p className="text-[10px] text-slate-500">Ordem de conferência</p>
        </div>
        <ol
          className="romaneio-tracking-grid grid gap-2 print:gap-1.5"
          data-columns={trackingColumnCount}
        >
          {group.pacotes.map((item, index) => (
            <li
              key={item.id}
              className="flex min-h-14 break-inside-avoid items-center gap-2 rounded-lg border border-slate-300 px-2.5 py-2 print:min-h-10 print:gap-1.5 print:rounded-md print:px-1.5 print:py-1.5"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white print:size-6 print:border print:border-slate-900 print:bg-white print:text-slate-950">
                {index + 1}
              </span>
              <span className="min-w-0 break-all font-mono text-[11px] font-bold leading-4 print:text-[9px] print:leading-3">
                {item.codigo_rastreio}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-6 break-inside-avoid border-t border-slate-300 pt-4 print:mt-5 print:pt-3">
        <p className="text-[10px] leading-4 text-slate-600">
          Confirmamos a entrega e o recebimento dos pacotes relacionados neste
          romaneio.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-8 text-center sm:grid-cols-2 print:grid-cols-2 print:gap-10">
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-bold">Transportadora</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Nome, documento e assinatura
            </p>
          </div>
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-bold">Responsável pela expedição</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Nome, documento e assinatura
            </p>
          </div>
        </div>
      </footer>
    </article>
  );
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
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700 print:hidden">
          {totalLabel}: {totalPacotes} pacotes
        </div>
      ) : null}

      {groups.map((group, groupIndex) => (
        <div key={group.id}>
          <RomaneioSheet group={group} />
          {groupIndex < groups.length - 1 ? (
            <div className="romaneio-page-break" />
          ) : null}
        </div>
      ))}
    </div>
  );
}
