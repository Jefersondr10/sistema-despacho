import { NextResponse } from "next/server";

import {
  createRelatorioEnvioHistorico,
  formatDatabaseError,
  getRelatorioDestinatarios,
  validateEmailAddress,
  type DatabaseContext,
} from "@/lib/database";
import {
  createSupabaseClientForAccessToken,
  isSupabaseConfigured,
} from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

class EmailConfigError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function getOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getOperationLabel(value: unknown) {
  if (value === "coleta") return "Coleta";
  if (value === "postagem") return "Postagem";

  return getOptionalString(value) || "OperaÃ§Ã£o nÃ£o informada";
}

type ReportOperation = "coleta" | "postagem" | "outros";

type ReportSummaryEntry = {
  marketplace: string;
  operation: ReportOperation;
  melhorEnvio: boolean;
  transportadora: string;
  packages: number;
  lojas: ReturnType<typeof getSummaryStores>;
};

const MAX_STORES_PER_SUMMARY = 12;
const MAX_SHIPPING_DETAILS_PER_MARKETPLACE = 12;
const emailDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const operationThemes: Array<{
  key: ReportOperation;
  label: string;
  background: string;
  color: string;
  border: string;
}> = [
  {
    key: "coleta",
    label: "Coleta",
    background: "#ccfbf1",
    color: "#115e59",
    border: "#5eead4",
  },
  {
    key: "postagem",
    label: "Postagem",
    background: "#dbeafe",
    color: "#1e40af",
    border: "#93c5fd",
  },
  {
    key: "outros",
    label: "Outras operaÃ§Ãµes",
    background: "#f1f5f9",
    color: "#334155",
    border: "#cbd5e1",
  },
];

function getPackageCount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function formatPackageCount(value: number) {
  return `${value} ${value === 1 ? "pacote" : "pacotes"}`;
}

function formatEmailDate(value: unknown) {
  const rawValue = getOptionalString(value);
  const date = new Date(rawValue);

  return rawValue && !Number.isNaN(date.getTime())
    ? emailDateFormatter.format(date)
    : rawValue || "NÃ£o informada";
}

function compactStores(lojas: ReportSummaryEntry["lojas"]) {
  const orderedStores = [...lojas].sort(
    (first, second) =>
      second.packages - first.packages ||
      first.nome.localeCompare(second.nome, "pt-BR"),
  );
  const visible = orderedStores.slice(0, MAX_STORES_PER_SUMMARY);
  const omitted = orderedStores.slice(MAX_STORES_PER_SUMMARY);

  return {
    visible,
    omittedCount: omitted.length,
    omittedPackages: omitted.reduce(
      (total, loja) => total + loja.packages,
      0,
    ),
  };
}

function compactShippingDetails(items: ReportSummaryEntry[]) {
  const orderedItems = [...items].sort(
    (first, second) =>
      second.packages - first.packages ||
      first.transportadora.localeCompare(second.transportadora, "pt-BR"),
  );
  const visible = orderedItems.slice(0, MAX_SHIPPING_DETAILS_PER_MARKETPLACE);
  const omitted = orderedItems.slice(MAX_SHIPPING_DETAILS_PER_MARKETPLACE);

  return {
    visible,
    omittedCount: omitted.length,
    omittedPackages: omitted.reduce(
      (total, item) => total + item.packages,
      0,
    ),
  };
}

function chunkTrackingItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function getReportOperation(value: unknown) {
  if (value === "coleta") {
    return "coleta" as const;
  }

  if (value === "postagem") {
    return "postagem" as const;
  }

  return "outros" as const;
}

function getReportSummaryEntries(relatorio: Record<string, unknown>) {
  const resumo = Array.isArray(relatorio.resumo)
    ? relatorio.resumo.filter(isRecord)
    : [];

  return resumo.map<ReportSummaryEntry>((item) => {
    const melhorEnvio = Boolean(item.melhor_envio);

    return {
      marketplace:
        getOptionalString(item.marketplace) || "Marketplace nÃ£o informado",
      operation: getReportOperation(item.tipo_operacao),
      melhorEnvio,
      transportadora: melhorEnvio
        ? getOptionalString(item.transportadora) || "NÃ£o informada"
        : "Sem Melhor Envio",
      packages: getPackageCount(item.packages),
      lojas: getSummaryStores(item),
    };
  });
}

function groupEntriesByMarketplace(entries: ReportSummaryEntry[]) {
  const groups = new Map<string, ReportSummaryEntry[]>();

  for (const entry of entries) {
    const current = groups.get(entry.marketplace);

    if (current) {
      current.push(entry);
    } else {
      groups.set(entry.marketplace, [entry]);
    }
  }

  return Array.from(groups, ([marketplace, items]) => ({
    marketplace,
    items,
    total: items.reduce((sum, item) => sum + item.packages, 0),
  })).sort((first, second) =>
    first.marketplace.localeCompare(second.marketplace, "pt-BR"),
  );
}

function getSummaryStores(item: Record<string, unknown>) {
  const lojas = Array.isArray(item.lojas) ? item.lojas.filter(isRecord) : [];

  return lojas.map((loja) => ({
    nome: getOptionalString(loja.loja_nome) || "Loja nÃ£o informada",
    packages: getPackageCount(loja.packages),
  }));
}

function getRomaneioGroups(relatorio: Record<string, unknown>) {
  const groups = Array.isArray(relatorio.romaneios)
    ? relatorio.romaneios.filter(isRecord)
    : [];

  return groups.map((group) => ({
    codigo_lote: getOptionalString(group.codigo_lote) || "Lote sem cÃ³digo",
    loja_nome: getOptionalString(group.loja_nome) || "Loja nÃ£o informada",
    marketplace:
      getOptionalString(group.marketplace) || "Marketplace nÃ£o informado",
    tipo_operacao: getOperationLabel(group.tipo_operacao),
    melhor_envio: Boolean(group.melhor_envio),
    transportadora:
      getOptionalString(group.transportadora) || "Sem transportadora",
    data: formatEmailDate(group.data),
    pacotes: Array.isArray(group.pacotes)
      ? group.pacotes.filter(isRecord).map((item) => ({
          codigo_rastreio:
            getOptionalString(item.codigo_rastreio) || "Sem cÃ³digo",
        }))
      : [],
  }));
}

function buildRomaneioEmail(
  payload: Record<string, unknown>,
  relatorio: Record<string, unknown>,
): EmailContent {
  const subject =
    getOptionalString(payload.assunto) || "Romaneio de Entrega / Coleta";
  const groups = getRomaneioGroups(relatorio);
  const totalPacotes = groups.reduce(
    (total, group) => total + group.pacotes.length,
    0,
  );
  const groupsHtml = groups.length
    ? groups
        .map((group) => {
          const numberedPackages = group.pacotes.map((item, index) => ({
            ...item,
            number: index + 1,
          }));
          const rows = numberedPackages.length
            ? chunkTrackingItems(numberedPackages, 3)
                .map(
                  (row) => `
                    <tr>
                      ${Array.from({ length: 3 }, (_, columnIndex) => {
                        const item = row[columnIndex];

                        return item
                          ? `
                              <td width="33.33%" style="padding: 10px; border-top: 1px solid #e2e8f0; border-right: ${columnIndex < 2 ? "1px solid #e2e8f0" : "0"}; color: #0f172a; font-size: 12px; vertical-align: top; word-break: break-all;">
                                <strong style="color: #2563eb;">${item.number}.</strong>
                                ${escapeHtml(item.codigo_rastreio)}
                              </td>
                            `
                          : `<td width="33.33%" style="padding: 10px; border-top: 1px solid #e2e8f0; border-right: ${columnIndex < 2 ? "1px solid #e2e8f0" : "0"};">&nbsp;</td>`;
                      }).join("")}
                    </tr>
                  `,
                )
                .join("")
            : '<tr><td colspan="3" style="padding: 16px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; text-align: center;">Nenhum pacote neste lote.</td></tr>';
          const carrier = group.melhor_envio
            ? `${group.transportadora} Â· Melhor Envio`
            : group.transportadora;

          return `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 24px; background-color: #ffffff; border: 1px solid #cbd5e1; border-collapse: separate; border-spacing: 0;">
              <tr>
                <td style="padding: 18px 20px; background-color: #172554;">
                  <p style="margin: 0 0 4px; color: #bfdbfe; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">Romaneio de pacotes</p>
                  <h2 style="margin: 0; color: #ffffff; font-size: 21px; line-height: 1.25;">${escapeHtml(group.loja_nome)}</h2>
                </td>
              </tr>
              <tr>
                <td style="padding: 14px 20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="50%" style="padding: 5px 12px 5px 0; color: #64748b; font-size: 11px; vertical-align: top;">
                        DATA<br /><strong style="color: #0f172a; font-size: 13px;">${escapeHtml(group.data)}</strong>
                      </td>
                      <td width="50%" style="padding: 5px 0; color: #64748b; font-size: 11px; vertical-align: top;">
                        TOTAL DE PACOTES<br /><strong style="color: #0f172a; font-size: 13px;">${escapeHtml(group.pacotes.length)}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td width="50%" style="padding: 7px 12px 5px 0; color: #64748b; font-size: 11px; vertical-align: top;">
                        LOTE<br /><strong style="color: #0f172a; font-size: 13px;">${escapeHtml(group.codigo_lote)}</strong>
                      </td>
                      <td width="50%" style="padding: 7px 0 5px; color: #64748b; font-size: 11px; vertical-align: top;">
                        MARKETPLACE<br /><strong style="color: #0f172a; font-size: 13px;">${escapeHtml(group.marketplace)}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td width="50%" style="padding: 7px 12px 5px 0; color: #64748b; font-size: 11px; vertical-align: top;">
                        OPERAÃ‡ÃƒO<br /><strong style="color: #0f172a; font-size: 13px;">${escapeHtml(group.tipo_operacao)}</strong>
                      </td>
                      <td width="50%" style="padding: 7px 0 5px; color: #64748b; font-size: 11px; vertical-align: top;">
                        TRANSPORTADORA<br /><strong style="color: #0f172a; font-size: 13px;">${escapeHtml(carrier)}</strong>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 0 20px 18px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e2e8f0; border-collapse: separate; border-spacing: 0;">
                    <tr>
                      <td colspan="3" style="padding: 8px 10px; background-color: #f8fafc; color: #475569; font-size: 10px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase;">Rastreios</td>
                    </tr>
                    ${rows}
                  </table>
                  <p style="margin: 18px 0 22px; color: #475569; font-size: 11px; line-height: 1.5;">Confirmamos a entrega e o recebimento dos pacotes relacionados neste romaneio.</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="48%" style="padding: 24px 8px 0 0; border-top: 1px solid #64748b; color: #0f172a; font-size: 11px; font-weight: 700; text-align: center;">Transportadora</td>
                      <td width="4%"></td>
                      <td width="48%" style="padding: 24px 0 0 8px; border-top: 1px solid #64748b; color: #0f172a; font-size: 11px; font-weight: 700; text-align: center;">ResponsÃ¡vel pela expediÃ§Ã£o</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          `;
        })
        .join("")
    : '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding: 20px; background-color: #ffffff; border: 1px solid #e2e8f0; color: #64748b; font-size: 13px; text-align: center;">Nenhum pacote encontrado para os filtros aplicados.</td></tr></table>';

  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin: 0; background-color: #f1f5f9; font-family: Arial, Helvetica, sans-serif;">
      <tr>
        <td align="center" style="padding: 24px 12px;">
          <table role="presentation" width="720" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 720px; border-collapse: separate; border-spacing: 0;">
            <tr>
              <td style="padding: 0 0 16px; color: #334155; font-size: 12px;">
                <strong style="color: #0f172a; font-size: 16px;">Romaneios de pacotes</strong><br />${escapeHtml(formatPackageCount(totalPacotes))} em ${escapeHtml(groups.length)} ${groups.length === 1 ? "lote" : "lotes"}
              </td>
            </tr>
            <tr><td>${groupsHtml}</td></tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = [
    "ROMANEIO DE ENTREGA / COLETA",
    `Total geral: ${totalPacotes} pacotes`,
    "",
    ...groups.flatMap((group) => [
      `LOJA: ${group.loja_nome}`,
      `Data: ${group.data}`,
      `Total: ${formatPackageCount(group.pacotes.length)}`,
      `Lote: ${group.codigo_lote}`,
      `Marketplace: ${group.marketplace}`,
      `OperaÃ§Ã£o: ${group.tipo_operacao}`,
      `Transportadora: ${group.transportadora}${group.melhor_envio ? " (Melhor Envio)" : ""}`,
      "Rastreios:",
      ...chunkTrackingItems(group.pacotes, 3).map((row, rowIndex) =>
        row
         ×®µ¶‰žËkºwµçe¡Ðè€ÜÀÀìÙ•ÉÑ¥…°µ…±¥¸èÑ½ÀìÝ¡¥Ñ”µÍÁ…”è¹½ÝÉ…Àìˆø‘í•Í…Á•!Ñµ°¡¥Ñ•´¹Á…­…•Ì¥ôð½Ñø(€€€€€€€€€€€€€€€€€€€€€€ñÑÍÑå±”ô‰Á…‘‘¥¹œè€ÄÉÁàì‰½É‘•ÈµÑ½Àè€ÅÁàÍ½±¥€”É”á˜ÀìÙ•ÉÑ¥…°µ…±¥¸èÑ½Àìˆø‘íÍÑ½É•Í!Ñµ±ôð½Ñø(€€€€€€€€€€€€€€€€€€€€ð½ÑÈø(€€€€€€€€€€€€€€€€€€ì(€€€€€€€€€€€€€€€ô¤(€€€€€€€€€€€€€€€€¹©½¥¸ ˆˆ¤ì(€€€€€€€€€€€€€½¹ÍÐ½µ¥ÑÑ•‘•Ñ…¥±ÍI½Ü€ô½µÁ…Ñ•‘%Ñ•µÌ¹½µ¥ÑÑ•‘½Õ¹Ð(€€€€€€€€€€€€€€€€ü€(€€€€€€€€€€€€€€€€€€€€ñÑÈø(€€€€€€€€€€€€€€€€€€€€€€ñÑ½±ÍÁ…¸ôˆÌˆÍÑå±”ô‰Á…‘‘¥¹œè€ÄÁÁà€ÄÉÁàì‰½É‘•ÈµÑ½Àè€ÅÁàÍ½±¥€”É”á˜Àì‰…­É½Õ¹µ½±½Èè€™™™‰•ˆì½±½Èè€ŒäÈÐÀÁ”ì™½¹ÐµÍ¥é”è€ÄÅÁàì±¥¹”µ¡•¥¡Ðè€Ä¸Ðìˆø(€€€€€€€€€€€€€€€€€€€€€€€5…¥Ì€‘í•Í…Á•!Ñµ°¡½µÁ…Ñ•‘%Ñ•µÌ¹½µ¥ÑÑ•‘½Õ¹Ð¥ô™½Éµ…Ì‘”•¹Ù¥¼™½É…´É•ÍÕµ¥‘…Ì€ ‘í•Í…Á•!Ñµ°¡™½Éµ…ÑA…­…•½Õ¹Ð¡½µÁ…Ñ•‘%Ñ•µÌ¹½µ¥ÑÑ•‘A…­…•Ì¤¥ô¤¸=ÌÑ½Ñ…¥Ì‘¼µ…É­•ÑÁ±…”Á•Éµ…¹••´½µÁ±•Ñ½Ì¸(€€€€€€€€€€€€€€€€€€€€€€ð½Ñø(€€€€€€€€€€€€€€€€€€€€ð½ÑÈø(€€€€€€€€€€€€€€€€€€(€€€€€€€€€€€€€€€€è€ˆˆì((€€€€€€€€€€€€€É•ÑÕÉ¸€(€€€€€€€€€€€€€€€€ñÑ…‰±”É½±”ô‰ÁÉ•Í•¹Ñ…Ñ¥½¸ˆÝ¥‘Ñ ôˆÄÀÀ”ˆ•±±Á…‘‘¥¹œôˆÀˆ•±±ÍÁ…¥¹œôˆÀˆ‰½É‘•ÈôˆÀˆÍÑå±”ô‰µ…É¥¸è€À€À€ÄÙÁàì‰½É‘•Èè€ÅÁàÍ½±¥€”É”á˜Àì‰½É‘•Èµ½±±…ÁÍ”èÍ•Á…É…Ñ”ì‰½É‘•ÈµÍÁ…¥¹œè€Àì‰½É‘•ÈµÉ…‘¥ÕÌè€áÁàì½Ù•É™±½Üè¡¥‘‘•¸ìˆø(€€€€€€€€€€€€€€€€€€ñÑÈø(€€€€€€€€€€€€€€€€€€€€ñÑ½±ÍÁ…¸ôˆÌˆÍÑå±”ô‰Á…‘‘¥¹œè€ÄÉÁà€ÄÑÁàì‰…­É½Õ¹µ½±½Èè€˜á™…™Œìˆø(€€€€€€€€€€€€€€€€€€€€€€ñÑ…‰±”É½±”ô‰ÁÉ•Í•¹Ñ…Ñ¥½¸ˆÝ¥‘Ñ ôˆÄÀÀ”ˆ•±±Á…‘‘¥¹œôˆÀˆ•±±ÍÁ…¥¹œôˆÀˆ‰½É‘•ÈôˆÀˆø(€€€€€€€€€€€€€€€€€€€€€€€€ñÑÈø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñÑÍÑå±”ô‰½±½Èè€ŒÁ˜ÄÜÉ„ì™½¹ÐµÍ¥é”è€ÄÕÁàì™½¹ÐµÝ•¥¡Ðè€ÜÀÀìˆø‘í•Í…Á•!Ñµ°¡µ…É­•ÑÁ±…”¹µ…É­•ÑÁ±…”¥ôð½Ñø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñÑ…±¥¸ô‰É¥¡ÐˆÍÑå±”ô‰½±½Èè€ŒÐÜÔÔØäì™½¹ÐµÍ¥é”è€ÄÉÁàì™½¹ÐµÝ•¥¡Ðè€ÜÀÀìÝ¡¥Ñ”µÍÁ…”è¹½ÝÉ…Àìˆø‘í•Í…Á•!Ñµ°¡™½Éµ…ÑA…­…•½Õ¹Ð¡µ…É­•ÑÁ±…”¹Ñ½Ñ…°¤¥ôð½Ñø(€€€€€€€€€€€€€€€€€€€€€€€€ð½ÑÈø(€€€€€€€€€€€€€€€€€€€€€€ð½Ñ…‰±”ø(€€€€€€€€€€€€€€€€€€€€ð½Ñø(€€€€€€€€€€€€€€€€€€ð½ÑÈø(€€€€€€€€€€€€€€€€€€ñÑÈÍÑå±”ô‰‰…­É½Õ¹µ½±½Èè€™™™™™˜ìˆø(€€€€€€€€€€€€€€€€€€€€ñÑ …±¥¸ô‰±•™ÐˆÝ¥‘Ñ ôˆÌÔ”ˆÍÑå±”ô‰Á…‘‘¥¹œè€áÁà€ÄÉÁàì‰½É‘•ÈµÑ½Àè€ÅÁàÍ½±¥€”É”á˜Àì½±½Èè€ŒØÐÜÐáˆì™½¹ÐµÍ¥é”è€ÄÁÁàì™½¹ÐµÝ•¥¡Ðè€ÜÀÀì±•ÑÑ•ÈµÍÁ…¥¹œè€¸ÕÁàìÑ•áÐµÑÉ…¹Í™½É´èÕÁÁ•É…Í”ìˆù¹Ù¥¼€¼ÑÉ…¹ÍÁ½ÉÑ…‘½É„ð½Ñ ø(€€€€€€€€€€€€€€€€€€€€ñÑ …±¥¸ô‰•¹Ñ•ÈˆÝ¥‘Ñ ôˆÄÔ”ˆÍÑå±”ô‰Á…‘‘¥¹œè€áÁà€ÄÉÁàì‰½É‘•ÈµÑ½Àè€ÅÁàÍ½±¥€”É”á˜Àì½±½Èè€ŒØÐÜÐáˆì™½¹ÐµÍ¥é”è€ÄÁÁàì™½¹ÐµÝ•¥¡Ðè€ÜÀÀì±•ÑÑ•ÈµÍÁ…¥¹œè€¸ÕÁàìÑ•áÐµÑÉ…¹Í™½É´èÕÁÁ•É…Í”ìˆùA…½Ñ•Ìð½Ñ ø(€€€€€€€€€€€€€€€€€€€€ñÑ …±¥¸ô‰±•™ÐˆÝ¥‘Ñ ôˆÔÀ”ˆÍÑå±”ô‰Á…‘‘¥¹œè€áÁà€ÄÉÁàì‰½É‘•ÈµÑ½Àè€ÅÁàÍ½±¥€”É”á˜Àì½±½Èè€ŒØÐÜÐáˆì™½¹ÐµÍ¥é”è€ÄÁÁàì™½¹ÐµÝ•¥¡Ðè€ÜÀÀì±•ÑÑ•ÈµÍÁ…¥¹œè€¸ÕÁàìÑ•áÐµÑÉ…¹Í™½É´èÕÁÁ•É…Í”ìˆùA½È±½©„ð½Ñ ø(€€€€€€€€€€€€€€€€€€ð½ÑÈø(€€€€€€€€€€€€€€€€€€‘í‘•Ñ…¥±I½ÝÍô(€€€€€€€€€€€€€€€€€€‘í½µ¥ÑÑ•‘•Ñ…¥±ÍI½Ýô(€€€€€€€€€€€€€€€€ð½Ñ…‰±”ø(€€€€€€€€€€€€€€ì(€€€€€€€€€€€ô¤(€€€€€€€€€€€€¹©½¥¸ ˆˆ¤ì((€€€€€€€€€É•ÑÕÉ¸€(€€€€€€€€€€€€ñÑ…‰±”É½±”ô‰ÁÉ•Í•¹Ñ…Ñ¥½¸ˆÝ¥‘Ñ ôˆÄÀÀ”ˆ•±±Á…‘‘¥¹œôˆÀˆ•±±ÍÁ…¥¹œôˆÀˆ‰½É‘•ÈôˆÀˆÍÑå±”ô‰µ…É¥¸è€ÈÑÁà€À€ÄÉÁàì‰½É‘•Èµ½±±…ÁÍ”èÍ•Á…É…Ñ”ì‰½É‘•ÈµÍÁ…¥¹œè€Àìˆø(€€€€€€€€€€€€€€ñÑÈø(€€€€€€€€€€€€€€€€ñÑÍÑå±”ô‰Á…‘‘¥¹œè€ÄÉÁà€ÄÑÁàì‰…­É½Õ¹µ½±½Èè€‘íÍ•Ñ¥½¸¹‰…­É½Õ¹‘ôì‰½É‘•Èè€ÅÁàÍ½±¥€‘íÍ•Ñ¥½¸¹‰½É‘•Éôì½±½Èè€‘íÍ•Ñ¥½¸¹½±½Éôì™½¹ÐµÍ¥é”è€ÄÙÁàì™½¹ÐµÝ•¥¡Ðè€ÜÀÀìˆø‘í•Í…Á•!Ñµ°¡Í•Ñ¥½¸¹±…‰•°¥ôð½Ñø(€€€€€€€€€€€€€€€€ñÑ…±¥¸ô‰É¥¡ÐˆÍÑå±”ô‰Á…‘‘¥¹œè€ÄÉÁà€ÄÑÁàì‰…­É½Õ¹µ½±½Èè€‘íÍ•Ñ¥½¸¹‰…­É½Õ¹‘ôì‰½É‘•ÈµÑ½Àè€ÅÁàÍ½±¥€‘íÍ•Ñ¥½¸¹‰½É‘•Éôì‰½É‘•ÈµÉ¥¡Ðè€ÅÁàÍ½±¥€‘íÍ•Ñ¥½¸¹‰½É‘•Éôì‰½É‘•Èµ‰½ÑÑ½´è€ÅÁàÍ½±¥€‘íÍ•Ñ¥½¸¹‰½É‘•Éôì½±½Èè€‘íÍ•Ñ¥½¸¹½±½Éôì™½¹ÐµÍ¥é”è€ÄÍÁàì™½¹ÐµÝ•¥¡Ðè€ÜÀÀìÝ¡¥Ñ”µÍÁ…”è¹½ÝÉ…Àìˆø‘í•Í…Á•!Ñµ°¡™½Éµ…ÑA…­…•½Õ¹Ð¡Í•Ñ¥½¸¹Ñ½Ñ…°¤¥ôð½Ñø(€€€€€€€€€€€€€€ð½ÑÈø(€€€€€€€€€€€€ð½Ñ…‰±”ø(€€€€€€€€€€€€‘íµ…É­•ÑÁ±…•Í!Ñµ±ô(€€€€€€€€€€ì(€€€€€€€ô¤(€€€€€€€€¹©½¥¸ ˆˆ¤(€€€€è€(€€€€€€€€ñÑ…‰±”É½±”ô‰ÁÉ•Í•¹Ñ…Ñ¥½¸ˆÝ¥‘Ñ ôˆÄÀÀ”ˆ•±±Á…‘‘¥¹œôˆÀˆ•±±ÍÁ…¥¹œôˆÀˆ‰½É‘•ÈôˆÀˆø(€€€€€€€€€€ñÑÈø(€€€€€€€€€€€€ñÑÍÑå±”ô‰Á…‘‘¥¹œè€ÈÁÁàì‰…­É½Õ¹µ½±½Èè€˜á™…™Œì‰½É‘•Èè€ÅÁàÍ½±¥€”É”á˜Àì½±½Èè€ŒØÐÜÐáˆì™½¹ÐµÍ¥é”è€ÄÍÁàìÑ•áÐµ…±¥¸è•¹Ñ•Èìˆù9•¹¡Õ´‘…‘¼•¹½¹ÑÉ…‘¼Á…É„½Ì™¥±ÑÉ½Ì…Á±¥…‘½Ì¸ð½Ñø(€€€€€€€€€€ð½ÑÈø(€€€€€€€€ð½Ñ…‰±”ø(€€€€€€ì((€½¹ÍÐ¡Ñµ°€ô€(€€€€ñÑ…‰±”É½±”ô‰ÁÉ•Í•¹Ñ…Ñ¥½¸ˆÝ¥‘Ñ ôˆÄÀÀ”ˆ•±±Á…‘‘¥¹œôˆÀˆ•±±ÍÁ…¥¹œôˆÀˆ‰½É‘•ÈôˆÀˆÍÑå±”ô‰Ý¥‘Ñ è€ÄÀÀ”ìµ…É¥¸è€Àì‰…­É½Õ¹µ½±½Èè€˜Å˜Õ˜äì™½¹Ðµ™…µ¥±äèÉ¥…°°!•±Ù•Ñ¥„°Í…¹ÌµÍ•É¥˜ìˆø(€€€€€€ñÑÈø(€€€€€€€€ñÑ…±¥¸ô‰•¹Ñ•ÈˆÍÑå±”ô‰Á…‘‘¥¹œè€ÈÑÁà€ÄÉÁàìˆø(€€€€€€€€€€ñÑ…‰±”É½±”ô‰ÁÉ•Í•¹Ñ…Ñ¥½¸ˆÝ¥‘Ñ ôˆÜÈÀˆ•±±Á…‘‘¥¹œôˆÀˆ•±±ÍÁ…¥¹œôˆÀˆ‰½É‘•ÈôˆÀˆÍÑå±”ô‰Ý¥‘Ñ è€ÄÀÀ”ìµ…àµÝ¥‘Ñ è€ÜÈÁÁàì‰…­É½Õ¹µ½±½Èè€™™™™™˜ì‰½É‘•Èµ½±±…ÁÍ”èÍ•Á…É…Ñ”ì‰½É‘•ÈµÍÁ…¥¹œè€Àì‰½É‘•ÈµÉ…‘¥ÕÌè€ÄÉÁàì½Ù•É™±½Üè¡¥‘‘•¸ìˆø(€€€€€€€€€€€€ñÑÈø(€€€€€€€€€€€€€€ñÑÍÑå±”ô‰Á…‘‘¥¹œè€ÈÑÁàì‰…­É½Õ¹µ½±½Èè€ŒÄÜÈÔÔÐìˆø(€€€€€€€€€€€€€€€€ñÀÍÑå±”ô‰µ…É¥¸è€À€À€ÙÁàì½±½Èè€‰™‘‰™”ì™½¹ÐµÍ¥é”è€ÄÅÁàì™½¹ÐµÝ•¥¡Ðè€ÜÀÀì±•ÑÑ•ÈµÍÁ…¥¹œè€ÅÁàìÑ•áÐµÑÉ…¹Í™½É´èÕÁÁ•É…Í”ìˆùM¥ÍÑ•µ„‘”‘•ÍÁ…¡¼ð½Àø(€€€€€€€€€€€€€€€€ñ ÄÍÑå±”ô‰µ…É¥¸è€Àì½±½Èè€™™™™™˜ì™½¹ÐµÍ¥é”è€ÈÑÁàì±¥¹”µ¡•¥¡Ðè€Ä¸ÈÔìˆùI•±…ÓÍÉ¥¼‘”Á…½Ñ•Ìð½ Äø(€€€€€€€€€€€€€€€€ñÀÍÑå±”ô‰µ…É¥¸è€áÁà€À€Àì½±½Èè€‘‰•…™”ì™½¹ÐµÍ¥é”è€ÄÍÁàì±¥¹”µ¡•¥¡Ðè€Ä¸Ôìˆù½±•Ñ…Ì”Á½ÍÑ…•¹Ì½É…¹¥é…‘…ÌÁ½Èµ…É­•ÑÁ±…”ð½Àø(€€€€€€€€€€€€€€ð½Ñø(€€€€€€€€€€€€ð½ÑÈø(€€€€€€€€€€€€ñÑÈø(€€€€€€€€€€€€€€ñÑÍÑå±”ô‰Á…‘‘¥¹œè€ÈÁÁà€ÈÑÁà€Àìˆø(€€€€€€€€€€€€€€€€ñÑ…‰±”É½±”ô‰ÁÉ•Í•¹Ñ…Ñ¥½¸ˆÝ¥‘Ñ ôˆÄÀÀ”ˆ•±±Á…‘‘¥¹œôˆÀˆ•±±ÍÁ…¥¹œôˆÀˆ‰½É‘•ÈôˆÀˆÍÑå±”ô‰‰½É‘•Èµ½±±…ÁÍ”èÍ•Á…É…Ñ”ì‰½É‘•ÈµÍÁ…¥¹œè€ÙÁàìˆø(€€€€€€€€€€€€€€€€€€ñÑÈø(€€€€€€€€€€€€€€€€€€€€ñÑÝ¥‘Ñ ôˆÌÐ”ˆ…±¥¸ô‰•¹Ñ•ÈˆÍÑå±”ô‰Á…‘‘¥¹œè€ÄÑÁà€áÁàì‰…­É½Õ¹µ½±½Èè€˜á™…™Œì‰½É‘•Èè€ÅÁàÍ½±¥€”É”á˜Àìˆø(€€€€€€€€€€€€€€€€€€€€€€ñÍÑÉ½¹œÍÑå±”ô‰‘¥ÍÁ±…äè‰±½¬ì½±½Èè€ŒÁ˜ÄÜÉ„ì™½¹ÐµÍ¥é”è€ÈÉÁàì±¥¹”µ¡•¥¡Ðè€Ä¸Äìˆø‘í•Í…Á•!Ñµ°¡Ñ½Ñ…±A…½Ñ•Ì¥ôð½ÍÑÉ½¹œø(€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”ô‰½±½Èè€ŒØÐÜÐáˆì™½¹ÐµÍ¥é”è€ÄÅÁàìˆùQ½Ñ…°•É…°ð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€ð½Ñø(€€€€€€€€€€€€€€€€€€€€ñÑÝ¥‘Ñ ôˆÌÌ”ˆ…±¥¸ô‰•¹Ñ•ÈˆÍÑå±”ô‰Á…‘‘¥¹œè€ÄÑÁà€áÁàì‰…­É½Õ¹µ½±½Èè€™‰˜Äì‰½É‘•Èè€ÅÁàÍ½±¥€Œäå˜Ù”Ðìˆø(€€€€€€€€€€€€€€€€€€€€€€ñÍÑÉ½¹œÍÑå±”ô‰‘¥ÍÁ±…äè‰±½¬ì½±½Èè€ŒÄÄÕ”Ôäì™½¹ÐµÍ¥é”è€ÈÉÁàì±¥¹”µ¡•¥¡Ðè€Ä¸Äìˆø‘í•Í…Á•!Ñµ°¡½±•Ñ…Q½Ñ…°¥ôð½ÍÑÉ½¹œø(€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”ô‰½±½Èè€ŒÁ˜ÜØÙ”ì™½¹ÐµÍ¥é”è€ÄÅÁàìˆù½±•Ñ„ð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€ð½Ñø(€€€€€€€€€€€€€€€€€€€€ñÑÝ¥‘Ñ ôˆÌÌ”ˆ…±¥¸ô‰•¹Ñ•ÈˆÍÑå±”ô‰Á…‘‘¥¹œè€ÄÑÁà€áÁàì‰…­É½Õ¹µ½±½Èè€‘‰•…™”ì‰½É‘•Èè€ÅÁàÍ½±¥€‰™‘‰™”ìˆø(€€€€€€€€€€€€€€€€€€€€€€ñÍÑÉ½¹œÍÑå±”ô‰‘¥ÍÁ±…äè‰±½¬ì½±½Èè€ŒÅ”ÐÁ…˜ì™½¹ÐµÍ¥é”è€ÈÉÁàì±¥¹”µ¡•¥¡Ðè€Ä¸Äìˆø‘í•Í…Á•!Ñµ°¡Á½ÍÑ…•µQ½Ñ…°¥ôð½ÍÑÉ½¹œø(€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”ô‰½±½Èè€ŒÅÑ•àì™½¹ÐµÍ¥é”è€ÄÅÁàìˆùA½ÍÑ…•´ð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€ð½Ñø(€€€€€€€€€€€€€€€€€€ð½ÑÈø(€€€€€€€€€€€€€€€€ð½Ñ…‰±”ø(€€€€€€€€€€€€€€ð½Ñø(€€€€€€€€€€€€ð½ÑÈø(€€€€€€€€€€€€ñÑÈø(€€€€€€€€€€€€€€ñÑÍÑå±”ô‰Á…‘‘¥¹œè€ÄÙÁà€ÈÑÁà€Àìˆø(€€€€€€€€€€€€€€€€ñÑ…‰±”É½±”ô‰ÁÉ•Í•¹Ñ…Ñ¥½¸ˆÝ¥‘Ñ ôˆÄÀÀ”ˆ•±±Á…‘‘¥¹œôˆÀˆ•±±ÍÁ…¥¹œôˆÀˆ‰½É‘•ÈôˆÀˆÍÑå±”ô‰‰…­É½Õ¹µ½±½Èè€˜á™…™Œì‰½É‘•Èè€ÅÁàÍ½±¥€”É”á˜Àìˆø(€€€€€€€€€€€€€€€€€€ñÑÈø(€€€€€€€€€€€€€€€€€€€€ñÑÍÑå±”ô‰Á…‘‘¥¹œè€ÄÉÁà€ÄÑÁàìˆø(€€€€€€€€€€€€€€€€€€€€€€ñÀÍÑå±”ô‰µ…É¥¸è€À€À€ÕÁàì½±½Èè€ŒÌÌÐÄÔÔì™½¹ÐµÍ¥é”è€ÄÅÁàì™½¹ÐµÝ•¥¡Ðè€ÜÀÀì±•ÑÑ•ÈµÍÁ…¥¹œè€¸ÕÁàìÑ•áÐµÑÉ…¹Í™½É´èÕÁÁ•É…Í”ìˆù¥±ÑÉ½Ì…Á±¥…‘½Ìð½Àø(€€€€€€€€€€€€€€€€€€€€€€ñÑ…‰±”É½±”ô‰ÁÉ•Í•¹Ñ…Ñ¥½¸ˆ•±±Á…‘‘¥¹œôˆÀˆ•±±ÍÁ…¥¹œôˆÀˆ‰½É‘•ÈôˆÀˆø‘í™¥±Ñ•É!Ñµ±ôð½Ñ…‰±”ø(€€€€€€€€€€€€€€€€€€€€ð½Ñø(€€€€€€€€€€€€€€€€€€ð½ÑÈø(€€€€€€€€€€€€€€€€ð½Ñ…‰±”ø(€€€€€€€€€€€€€€ð½Ñø(€€€€€€€€€€€€ð½ÑÈø(€€€€€€€€€€€€ñÑÈø(€€€€€€€€€€€€€€ñÑÍÑå±”ô‰Á…‘‘¥¹œè€À€ÈÑÁà€áÁàìˆø‘í½Á•É…Ñ¥½¹M•Ñ¥½¹Í!Ñµ±ôð½Ñø(€€€€€€€€€€€€ð½ÑÈø(€€€€€€€€€€€€ñÑÈø(€€€€€€€€€€€€€€ñÑÍÑå±”ô‰Á…‘‘¥¹œè€ÄÙÁà€ÈÑÁàì‰…­É½Õ¹µ½±½Èè€˜á™…™Œì‰½É‘•ÈµÑ½Àè€ÅÁàÍ½±¥€”É”á˜Àì½±½Èè€ŒØÐÜÐáˆì™½¹ÐµÍ¥é”è€ÄÅÁàìÑ•áÐµ…±¥¸è•¹Ñ•ÈìˆùI•±…ÓÍÉ¥¼•É…‘¼…ÕÑ½µ…Ñ¥…µ•¹Ñ”Á•±¼Í¥ÍÑ•µ„‘”‘•ÍÁ…¡¼¸ð½Ñø(€€€€€€€€€€€€ð½ÑÈø(€€€€€€€€€€ð½Ñ…‰±”ø(€€€€€€€€ð½Ñø(€€€€€€ð½ÑÈø(€€€€ð½Ñ…‰±”ø(€€ì((€½¹ÍÐÑ•áÐ€ôl(€€€€‰I1SMI%<A=QLˆ°(€€€Q½Ñ…°•É…°è€‘íÑ½Ñ…±A…½Ñ•ÍôÁ…½Ñ•Í€°(€€€½±•Ñ„è€‘í½±•Ñ…Q½Ñ…±ôÁ…½Ñ•Í€°(€€€A½ÍÑ…•´è€‘íÁ½ÍÑ…•µQ½Ñ…±ôÁ…½Ñ•Í€°(€€€€ˆˆ°(€€€€‰%1QI=LA1%=Lˆ°(€€€€¸¸¹™¥±Ñ•É%Ñ•µÌ¹µ…À ¡m­•ä°Ù…±Õ•t¤€ôø€‘í­•åôè€‘íMÑÉ¥¹œ¡Ù…±Õ”€üü€ˆˆ¥õ€¤°(€€€€ˆˆ°(€€€€¸¸¹½Á•É…Ñ¥½¹M•Ñ¥½¹Ì¹™±…Ñ5…À ¡Í•Ñ¥½¸¤€ôøl(€€€€€€‘íÍ•Ñ¥½¸¹±…‰•°¹Ñ½UÁÁ•É…Í” ¥ôƒŠP€‘í™½Éµ…ÑA…­…•½Õ¹Ð¡Í•Ñ¥½¸¹Ñ½Ñ…°¥õ€°(€€€€€€¸¸¹Í•Ñ¥½¸¹µ…É­•ÑÁ±…•Ì¹™±…Ñ5…À ¡µ…É­•ÑÁ±…”¤€ôøì(€€€€€€€½¹ÍÐ½µÁ…Ñ•‘%Ñ•µÌ€ô½µÁ…ÑM¡¥ÁÁ¥¹•Ñ…¥±Ì¡µ…É­•ÑÁ±…”¹¥Ñ•µÌ¤ì((€€€€€€€É•ÑÕÉ¸l(€€€€€€€€€€€€‘íµ…É­•ÑÁ±…”¹µ…É­•ÑÁ±…•ôƒŠP€‘í™½Éµ…ÑA…­…•½Õ¹Ð¡µ…É­•ÑÁ±…”¹Ñ½Ñ…°¥õ€°(€€€€€€€€€€¸¸¹½µÁ…Ñ•‘%Ñ•µÌ¹Ù¥Í¥‰±”¹µ…À ¡¥Ñ•´¤€ôøì(€€€€€€€€€€€½¹ÍÐ½µÁ…Ñ•‘MÑ½É•Ì€ô½µÁ…ÑMÑ½É•Ì¡¥Ñ•´¹±½©…Ì¤ì(€€€€€€€€€€€½¹ÍÐ±½©…ÍQ•áÐ€ô½µÁ…Ñ•‘MÑ½É•Ì¹Ù¥Í¥‰±”¹±•¹Ñ (€€€€€€€€€€€€€€ü½µÁ…Ñ•‘MÑ½É•Ì¹Ù¥Í¥‰±”(€€€€€€€€€€€€€€€€€€¹µ…À ¡±½©„¤€ôø€‘í±½©„¹¹½µ•ôè€‘í±½©„¹Á…­…•Íõ€¤(€€€€€€€€€€€€€€€€€€¹©½¥¸ ˆ°€ˆ¤(€€€€€€€€€€€€€€è€‰M•´‘•Ñ…±¡…µ•¹Ñ¼Á½È±½©„ˆì(€€€€€€€€€€€½¹ÍÐ½µ¥ÑÑ•‘MÑ½É•ÍQ•áÐ€ô½µÁ…Ñ•‘MÑ½É•Ì¹½µ¥ÑÑ•‘½Õ¹Ð(€€€€€€€€€€€€€€ü€ì€¬€‘í½µÁ…Ñ•‘MÑ½É•Ì¹½µ¥ÑÑ•‘½Õ¹Ñô±½©…ÌÉ•ÍÕµ¥‘…Ì€ ‘í™½Éµ…ÑA…­…•½Õ¹Ð¡½µÁ…Ñ•‘MÑ½É•Ì¹½µ¥ÑÑ•‘A…­…•Ì¥ô¥€(€€€€€€€€€€€€€€è€ˆˆì(€€€€€€€€€€€½¹ÍÐÍ¡¥ÁÁ¥¹1…‰•°€ô¥Ñ•´¹µ•±¡½É¹Ù¥¼(€€€€€€€€€€€€€€ü€‰5•±¡½È¹Ù¥¼ˆ(€€€€€€€€€€€€€€è€‰¹Ù¥¼‘¥É•Ñ¼ˆì((€€€€€€€€€€€É•ÑÕÉ¸€€€€€‘íÍ¡¥ÁÁ¥¹1…‰•±ôð€‘í¥Ñ•´¹ÑÉ…¹ÍÁ½ÉÑ…‘½É…ôð€‘í™½Éµ…ÑA…­…•½Õ¹Ð¡¥Ñ•´¹Á…­…•Ì¥ôðA½È±½©„è€‘í±½©…ÍQ•áÑô‘í½µ¥ÑÑ•‘MÑ½É•ÍQ•áÑõ€ì(€€€€€€€€€ô¤°(€€€€€€€€€€¸¸¸¡½µÁ…Ñ•‘%Ñ•µÌ¹½µ¥ÑÑ•‘½Õ¹Ð(€€€€€€€€€€€€ül(€€€€€€€€€€€€€€€€€€€€¬€‘í½µÁ…Ñ•‘%Ñ•µÌ¹½µ¥ÑÑ•‘½Õ¹Ñô™½Éµ…Ì‘”•¹Ù¥¼É•ÍÕµ¥‘…Ì€ ‘í™½Éµ…ÑA…­…•½Õ¹Ð¡½µÁ…Ñ•‘%Ñ•µÌ¹½µ¥ÑÑ•‘A…­…•Ì¥ô¤ìÑ½Ñ…¥ÌÁÉ•Í•ÉÙ…‘½Ì¹€°(€€€€€€€€€€€€€t(€€€€€€€€€€€€èmt¤°(€€€€€€€tì(€€€€€ô¤°(€€€€€€ˆˆ°(€€€t¤°(€t¹©½¥¸ ‰q¸ˆ¤ì((€É•ÑÕÉ¸ìÍÕ‰©•Ð°¡Ñµ°°Ñ•áÐôì)ô()…Íå¹Œ™Õ¹Ñ¥½¸Í•¹‘µ…¥±]¥Ñ¡I•Í•¹¡ì(€Ñ¼°(€ÍÕ‰©•Ð°(€¡Ñµ°°(€Ñ•áÐ°)ôèµ…¥±½¹Ñ•¹Ð€˜ìÑ¼èÍÑÉ¥¹mtô¤ì(€½¹ÍÐ…Á¥-•ä€ôÁÉ½•ÍÌ¹•¹Ø¹IM9}A%}-dü¹ÑÉ¥´ ¤ì(€½¹ÍÐ™É½´€ôÁÉ½•ÍÌ¹•¹Ø¹I1Q=I%=M}5%1}I=4ü¹ÑÉ¥´ ¤ì(€½¹ÍÐÉ•Á±åQ¼€ôÁÉ½•ÍÌ¹•¹Ø¹I1Q=I%=M}5%1}IA1e}Q<ü¹ÑÉ¥´ ¤ì((€¥˜€ ……Á¥-•äñð€…™É½´¤ì(€€€Ñ¡É½Ü¹•Üµ…¥±½¹™¥ÉÉ½È (€€€€€€‰¹Ù¥¼‘””µµ…¥°¹…¼½¹™¥ÕÉ…‘¼¸•™¥¹„IM9}A%}-d”I1Q=I%=M}5%1}I=4¹¼…µ‰¥•¹Ñ”‘¼‰…­•¹¸ˆ°(€€€€¤ì(€ô((€½¹ÍÐÉ•ÍÁ½¹Í”€ô…Ý…¥Ð™•Ñ  ‰¡ÑÑÁÌè¼½…Á¤¹É•Í•¹¹½´½•µ…¥±Ìˆ°ì(€€€µ•Ñ¡½è€‰A=MPˆ°(€€€¡•…‘•ÉÌèì(€€€€€ÕÑ¡½É¥é…Ñ¥½¸è	•…É•È€‘í…Á¥-•åõ€°(€€€€€€‰½¹Ñ•¹ÐµQåÁ”ˆè€‰…ÁÁ±¥…Ñ¥½¸½©Í½¸ˆ°(€€€€€€‰%‘•µÁ½Ñ•¹äµ-•äˆèÉåÁÑ¼¹É…¹‘½µUU% ¤°(€€€ô°(€€€‰½‘äè)M=8¹ÍÑÉ¥¹¥™ä¡ì(€€€€€™É½´°(€€€€€Ñ¼°(€€€€€ÍÕ‰©•Ð°(€€€€€¡Ñµ°°(€€€€€Ñ•áÐ°(€€€€€€¸¸¸¡É•Á±åQ¼€üìÉ•Á±å}Ñ¼èÉ•Á±åQ¼ô€èíô¤°(€€€ô¤°(€ô¤ì((€¥˜€ …É•ÍÁ½¹Í”¹½¬¤ì(€€€½¹ÍÐ‰½‘ä€ô…Ý…¥ÐÉ•ÍÁ½¹Í”¹Ñ•áÐ ¤ì(€€€Ñ¡É½Ü¹•ÜÉÉ½È (€€€€€…±¡„¹¼ÁÉ½Ù•‘½È‘””µµ…¥°€ ‘íÉ•ÍÁ½¹Í”¹ÍÑ…ÑÕÍô¤è€‘í‰½‘äñðÉ•ÍÁ½¹Í”¹ÍÑ…ÑÕÍQ•áÑõ€°(€€€€¤ì(€ô((€É•ÑÕÉ¸É•ÍÁ½¹Í”¹©Í½¸ ¤ì)ô()…Íå¹Œ™Õ¹Ñ¥½¸Í…Ù•!¥ÍÑ½Éä¡ì(€‘•ÍÑ¥¹…Ñ…É¥½Ì°(€…ÍÍÕ¹Ñ¼°(€™¥±ÑÉ½Ì°(€ÍÑ…ÑÕÌ°(€•ÉÉ¼°)ôèì(€‘•ÍÑ¥¹…Ñ…É¥½ÌèÍÑÉ¥¹mtì(€…ÍÍÕ¹Ñ¼èÍÑÉ¥¹œì(€™¥±ÑÉ½ÌèI•½ÉñÍÑÉ¥¹œ°Õ¹­¹½Ý¸øì(€ÍÑ…ÑÕÌè€‰ÍÕ•ÍÍ¼ˆð€‰•ÉÉ¼ˆì(€•ÉÉ¼üèÍÑÉ¥¹œð¹Õ±°ì)ô°½¹Ñ•áÐè…Ñ…‰…Í•½¹Ñ•áÐ¤ì(€ÑÉäì(€€€…Ý…¥ÐÉ•…Ñ•I•±…Ñ½É¥½¹Ù¥½!¥ÍÑ½É¥¼¡ì(€€€€€‘•ÍÑ¥¹…Ñ…É¥½Ì°(€€€€€…ÍÍÕ¹Ñ¼°(€€€€€™¥±ÑÉ½Ì°(€€€€€ÍÑ…ÑÕÌ°(€€€€€•ÉÉ¼°(€€€ô°½¹Ñ•áÐ¤ì(€ô…Ñ €¡¡¥ÍÑ½ÉåÉÉ½È¤ì(€€€½¹Í½±”¹•ÉÉ½È ‰…±¡„…¼Í…±Ù…È¡¥ÍÑ½É¥¼‘”•¹Ù¥¼èˆ°¡¥ÍÑ½ÉåÉÉ½È¤ì(€ô)ô()•áÁ½ÉÐ…Íå¹Œ™Õ¹Ñ¥½¸A=MP¡É•ÅÕ•ÍÐèI•ÅÕ•ÍÐ¤ì(€¥˜€ …¥ÍMÕÁ…‰…Í•½¹™¥ÕÉ• ¤¤ì(€€€É•ÑÕÉ¸9•áÑI•ÍÁ½¹Í”¹©Í½¸ (€€€€€ì½¬è™…±Í”°µ•ÍÍ…”è€‰MÕÁ…‰…Í”¹…¼½¹™¥ÕÉ…‘¼¸ˆô°(€€€€€ìÍÑ…ÑÕÌè€ÔÀÌô°(€€€€¤ì(€ô((€½¹ÍÐ…ÕÑ¡½É¥é…Ñ¥½¸€ôÉ•ÅÕ•ÍÐ¹¡•…‘•ÉÌ¹•Ð ‰…ÕÑ¡½É¥é…Ñ¥½¸ˆ¤€üü€ˆˆì(€½¹ÍÐÑ½­•¸€ô…ÕÑ¡½É¥é…Ñ¥½¸¹ÍÑ…ÉÑÍ]¥Ñ  ‰	•…É•È€ˆ¤(€€€€ü…ÕÑ¡½É¥é…Ñ¥½¸¹Í±¥” ‰	•…É•È€ˆ¹±•¹Ñ ¤¹ÑÉ¥´ ¤(€€€€è€ˆˆì((€¥˜€ …Ñ½­•¸¤ì(€€€É•ÑÕÉ¸9•áÑI•ÍÁ½¹Í”¹©Í½¸ (€€€€€ì½¬è™…±Í”°µ•ÍÍ…”è€‰M•ÍÍ…¼½‰É¥…Ñ½É¥„Á…É„•¹Ù¥…È¼É•±…Ñ½É¥¼¸ˆô°(€€€€€ìÍÑ…ÑÕÌè€ÐÀÄô°(€€€€¤ì(€ô((€½¹ÍÐ…ÕÑ¡•¹Ñ¥…Ñ•‘±¥•¹Ð€ôÉ•…Ñ•MÕÁ…‰…Í•±¥•¹Ñ½É•ÍÍQ½­•¸¡Ñ½­•¸¤ì(€½¹ÍÐì‘…Ñ„èÕÍ•É…Ñ„°•ÉÉ½ÈèÕÍ•ÉÉÉ½Èô€ô(€€€…Ý…¥Ð…ÕÑ¡•¹Ñ¥…Ñ•‘±¥•¹Ð¹…ÕÑ ¹•ÑUÍ•È¡Ñ½­•¸¤ì((€¥˜€¡ÕÍ•ÉÉÉ½Èñð€…ÕÍ•É…Ñ„¹ÕÍ•È¤ì(€€€É•ÑÕÉ¸9•áÑI•ÍÁ½¹Í”¹©Í½¸ (€€€€€ì½¬è™…±Í”°µ•ÍÍ…”è€‰M•ÍÍ…¼¥¹Ù…±¥‘„½Ô•áÁ¥É…‘„¸¹ÑÉ”¹½Ù…µ•¹Ñ”¸ˆô°(€€€€€ìÍÑ…ÑÕÌè€ÐÀÄô°(€€€€¤ì(€ô((€½¹ÍÐ‘…Ñ…‰…Í•½¹Ñ•áÐè…Ñ…‰…Í•½¹Ñ•áÐ€ôì(€€€ÍÕÁ…‰…Í”è…ÕÑ¡•¹Ñ¥…Ñ•‘±¥•¹Ð°(€€€ÕÍ•É%èÕÍ•É…Ñ„¹ÕÍ•È¹¥°(€ôì((€±•ÐÁ…å±½…èÕ¹­¹½Ý¸ì(€ÑÉäì(€€€Á…å±½…€ô…Ý…¥ÐÉ•ÅÕ•ÍÐ¹©Í½¸ ¤ì(€ô…Ñ ì(€€€É•ÑÕÉ¸9•áÑI•ÍÁ½¹Í”¹©Í½¸ (€€€€€ì½¬è™…±Í”°µ•ÍÍ…”è€‰A…å±½…¥¹Ù…±¥‘¼¸ˆô°(€€€€€ìÍÑ…ÑÕÌè€ÐÀÀô°(€€€€¤ì(€ô((€¥˜€ …¥ÍI•½É¡Á…å±½…¤¤ì(€€€É•ÑÕÉ¸9•áÑI•ÍÁ½¹Í”¹©Í½¸ (€€€€€ì½¬è™…±Í”°µ•ÍÍ…”è€‰A…å±½…¥¹Ù…±¥‘¼¸ˆô°(€€€€€ìÍÑ…ÑÕÌè€ÐÀÀô°(€€€€¤ì(€ô((€½¹ÍÐ‘•ÍÑ¥¹…Ñ…É¥½%‘Ì€ôÕ¹¥ÅÕ”¡•ÑMÑÉ¥¹ÉÉ…ä¡Á…å±½…¹‘•ÍÑ¥¹…Ñ…É¥½%‘Ì¤¤ì(€±•Ð•µ…¥±Í5…¹Õ…¥ÌèÍÑÉ¥¹mtì(€ÑÉäì(€€€•µ…¥±Í5…¹Õ…¥Ì€ôÕ¹¥ÅÕ” (€€€€€•ÑMÑÉ¥¹ÉÉ…ä¡Á…å±½…¹•µ…¥±Í5…¹Õ…¥Ì¤¹µ…À ¡•µ…¥°¤€ôø(€€€€€€€Ù…±¥‘…Ñ•µ…¥±‘‘É•ÍÌ¡•µ…¥°¤°(€€€€€€¤°(€€€€¤ì(€ô…Ñ €¡Ù…±¥‘…Ñ¥½¹ÉÉ½È¤ì(€€€É•ÑÕÉ¸9•áÑI•ÍÁ½¹Í”¹©Í½¸ (€€€€€ì½¬è™…±Í”°µ•ÍÍ…”è™½Éµ…Ñ…Ñ…‰…Í•ÉÉ½È¡Ù…±¥‘…Ñ¥½¹ÉÉ½È¤ô°(€€€€€ìÍÑ…ÑÕÌè€ÐÀÀô°(€€€€¤ì(€ô((€±•Ð…Ñ¥Ù½ÌèÝ…¥Ñ•ñI•ÑÕÉ¹QåÁ”ñÑåÁ•½˜•ÑI•±…Ñ½É¥½•ÍÑ¥¹…Ñ…É¥½Ìøøì(€ÑÉäì(€€€…Ñ¥Ù½Ì€ô…Ý…¥Ð•ÑI•±…Ñ½É¥½•ÍÑ¥¹…Ñ…É¥½Ì¡Õ¹‘•™¥¹•°‘…Ñ…‰…Í•½¹Ñ•áÐ¤ì(€ô…Ñ €¡‘…Ñ…‰…Í•ÉÉ½È¤ì(€€€É•ÑÕÉ¸9•áÑI•ÍÁ½¹Í”¹©Í½¸ (€€€€€ì(€€€€€€€½¬è™…±Í”°(€€€€€€€µ•ÍÍ…”èÉÉ¼…¼…ÉÉ•…È‘•ÍÑ¥¹…Ñ…É¥½Ìè€‘í™½Éµ…Ñ…Ñ…‰…Í•ÉÉ½È¡‘…Ñ…‰…Í•ÉÉ½È¥õ€°(€€€€€ô°(€€€€€ìÍÑ…ÑÕÌè€ÔÀÀô°(€€€€¤ì(€ô((€½¹ÍÐ…Ñ¥Ù½ÍA½É%€ô¹•Ü5…À¡…Ñ¥Ù½Ì¹µ…À ¡¥Ñ•´¤€ôøm¥Ñ•´¹¥°¥Ñ•µt¤¤ì(€½¹ÍÐ‘•ÍÑ¥¹…Ñ…É¥½Í…‘…ÍÑÉ…‘½Ì€ô‘•ÍÑ¥¹…Ñ…É¥½%‘Ì¹™±…Ñ5…À ¡¥¤€ôøì(€€€½¹ÍÐ¥Ñ•´€ô…Ñ¥Ù½ÍA½É%¹•Ð¡¥¤ì((€€€É•ÑÕÉ¸¥Ñ•´€üm¥Ñ•´¹•µ…¥±t€èmtì(€ô¤ì(€½¹ÍÐ‘•ÍÑ¥¹…Ñ…É¥½Ì€ôÕ¹¥ÅÕ”¡l¸¸¹‘•ÍÑ¥¹…Ñ…É¥½Í…‘…ÍÑÉ…‘½Ì°€¸¸¹•µ…¥±Í5…¹Õ…¥Ít¤ì(€½¹ÍÐ•µ…¥±½¹Ñ•¹Ð€ô‰Õ¥±‘I•Á½ÉÑµ…¥°¡Á…å±½…¤ì(€½¹ÍÐ™¥±ÑÉ½Ì€ôì(€€€™¥±ÑÉ½Ìè¥ÍI•½É¡Á…å±½…¹™¥±ÑÉ½Ì¤€üÁ…å±½…¹™¥±ÑÉ½Ì€èíô°(€€€™¥±ÑÉ½ÍI•ÍÕµ¼è¥ÍI•½É¡Á…å±½…¹™¥±ÑÉ½ÍI•ÍÕµ¼¤€üÁ…å±½…¹™¥±ÑÉ½ÍI•ÍÕµ¼€èíô°(€€€É•±…Ñ½É¥¼è¥ÍI•½É¡Á…å±½…¹É•±…Ñ½É¥¼¤€üÁ…å±½…¹É•±…Ñ½É¥¼€èíô°(€ôì((€¥˜€ …‘•ÍÑ¥¹…Ñ…É¥½Ì¹±•¹Ñ ¤ì(€€€É•ÑÕÉ¸9•áÑI•ÍÁ½¹Í”¹©Í½¸ (€€€€€ì(€€€€€€€½¬è™…±Í”°(€€€€€€€µ•ÍÍ…”è€‰M•±•¥½¹”…¼µ•¹½ÌÕ´‘•ÍÑ¥¹…Ñ…É¥¼…Ñ¥Ù¼Á…É„•¹Ù¥…È¸ˆ°(€€€€€ô°(€€€€€ìÍÑ…ÑÕÌè€ÐÀÀô°(€€€€¤ì(€ô((€¥˜€¡‘•ÍÑ¥¹…Ñ…É¥½Ì¹±•¹Ñ €ø€ÔÀ¤ì(€€€É•ÑÕÉ¸9•áÑI•ÍÁ½¹Í”¹©Í½¸ (€€€€€ì(€€€€€€€½¬è™…±Í”°(€€€€€€€µ•ÍÍ…”è€‰<•¹Ù¥¼…•¥Ñ„¹¼µ…á¥µ¼€ÔÀ‘•ÍÑ¥¹…Ñ…É¥½ÌÁ½ÈÙ•è¸ˆ°(€€€€€ô°(€€€€€ìÍÑ…ÑÕÌè€ÐÀÀô°(€€€€¤ì(€ô((€ÑÉäì(€€€…Ý…¥ÐÍ•¹‘µ…¥±]¥Ñ¡I•Í•¹¡ì€¸¸¹•µ…¥±½¹Ñ•¹Ð°Ñ¼è‘•ÍÑ¥¹…Ñ…É¥½Ìô¤ì(€€€…Ý…¥ÐÍ…Ù•!¥ÍÑ½Éä¡ì(€€€€€‘•ÍÑ¥¹…Ñ…É¥½Ì°(€€€€€…ÍÍÕ¹Ñ¼è•µ…¥±½¹Ñ•¹Ð¹ÍÕ‰©•Ð°(€€€€€™¥±ÑÉ½Ì°(€€€€€ÍÑ…ÑÕÌè€‰ÍÕ•ÍÍ¼ˆ°(€€€ô°‘…Ñ…‰…Í•½¹Ñ•áÐ¤ì((€€€É•ÑÕÉ¸9•áÑI•ÍÁ½¹Í”¹©Í½¸¡ì(€€€€€½¬èÑÉÕ”°(€€€€€Ñ½Ñ…±•ÍÑ¥¹…Ñ…É¥½Ìè‘•ÍÑ¥¹…Ñ…É¥½Ì¹±•¹Ñ °(€€€ô¤ì(€ô…Ñ €¡•ÉÉ½È¤ì(€€€½¹ÍÐµ•ÍÍ…”€ô™½Éµ…Ñ…Ñ…‰…Í•ÉÉ½È¡•ÉÉ½È¤ì(€€€…Ý…¥ÐÍ…Ù•!¥ÍÑ½Éä¡ì(€€€€€‘•ÍÑ¥¹…Ñ…É¥½Ì°(€€€€€…ÍÍÕ¹Ñ¼è•µ…¥±½¹Ñ•¹Ð¹ÍÕ‰©•Ð°(€€€€€™¥±ÑÉ½Ì°(€€€€€ÍÑ…ÑÕÌè€‰•ÉÉ¼ˆ°(€€€€€•ÉÉ¼èµ•ÍÍ…”°(€€€ô°‘…Ñ…‰…Í•½¹Ñ•áÐ¤ì((€€€É•ÑÕÉ¸9•áÑI•ÍÁ½¹Í”¹©Í½¸ (€€€€€ì½¬è™…±Í”°µ•ÍÍ…”ô°(€€€€€ìÍÑ…ÑÕÌè•ÉÉ½È¥¹ÍÑ…¹•½˜µ…¥±½¹™¥ÉÉ½È€ü€ÔÀÄ€è€ÔÀÀô°(€€€€¤ì(€ô)ô