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

const RESEND_EMAIL_TIMEOUT_MS = 10_000;
const EMAIL_CONFIG_PUBLIC_MESSAGE =
  "O envio por e-mail ainda não está configurado. Avise o administrador do sistema.";
const EMAIL_DELIVERY_PUBLIC_MESSAGE =
  "Não foi possível enviar o relatório por e-mail agora. Tente novamente em alguns minutos. Se o problema continuar, avise o administrador.";

type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

class EmailConfigError extends Error {
  constructor() {
    super(EMAIL_CONFIG_PUBLIC_MESSAGE);
    this.name = "EmailConfigError";
  }
}

class EmailDeliveryError extends Error {
  constructor() {
    super(EMAIL_DELIVERY_PUBLIC_MESSAGE);
    this.name = "EmailDeliveryError";
  }
}

class ReportPayloadError extends Error {}

type SafeEmailFailureDetails =
  | {
      kind: "configuration";
      apiKeyConfigured: boolean;
      senderConfigured: boolean;
    }
  | { kind: "provider"; status: number }
  | { kind: "timeout" | "network" };

function logReportEmailFailure(details: SafeEmailFailureDetails) {
  console.error("Falha no envio de relatório por e-mail.", details);
}

function isEmailTimeoutError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

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
    label: "Outras operações",
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

function getRomaneioTrackingColumnCount(
  packages: Array<{ codigo_rastreio: string }>,
) {
  const hasLongTrackingCode = packages.some(
    (item) => item.codigo_rastreio.trim().length > 18,
  );

  return hasLongTrackingCode ? 4 : 5;
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
        getOptionalString(item.marketplace) || "Marketplace não informado",
      operation: getReportOperation(item.tipo_operacao),
      melhorEnvio,
      transportadora: melhorEnvio
        ? getOptionalString(item.transportadora) || "Não informada"
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
    nome: getOptionalString(loja.loja_nome) || "Loja não informada",
    packages: getPackageCount(loja.packages),
  }));
}

function getRomaneioGroups(relatorio: Record<string, unknown>) {
  const groups = Array.isArray(relatorio.romaneios)
    ? relatorio.romaneios.filter(isRecord)
    : [];

  return groups.map((group) => {
    const legacyMarketplaces = unique(
      getStringArray(group.marketplaces)
        .map((marketplace) => marketplace.trim())
        .filter(Boolean),
    );
    const explicitMarketplace = getOptionalString(group.marketplace).trim();

    if (legacyMarketplaces.length > 1) {
      throw new ReportPayloadError(
        "Este romaneio foi aberto em uma versão antiga. Recarregue a página para separar os marketplaces antes de enviar.",
      );
    }

    const marketplace =
      explicitMarketplace || legacyMarketplaces[0] || "Não informado";

    return {
      id: getOptionalString(group.id),
      loja_nome: getOptionalString(group.loja_nome) || "Loja não informada",
      marketplace,
      periodo: getOptionalString(group.periodo) || "Não informado",
      pacotes: Array.isArray(group.pacotes)
        ? group.pacotes.filter(isRecord).map((item) => ({
            codigo_rastreio:
              getOptionalString(item.codigo_rastreio) || "Sem código",
          }))
        : [],
    };
  });
}

function buildRomaneioEmail(
  _payload: Record<string, unknown>,
  relatorio: Record<string, unknown>,
): EmailContent {
  const subject = "Romaneio de Pacotes";
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
          const trackingColumnCount = getRomaneioTrackingColumnCount(
            group.pacotes,
          );
          const trackingColumnWidth = `${100 / trackingColumnCount}%`;
          const rows = numberedPackages.length
            ? chunkTrackingItems(numberedPackages, trackingColumnCount)
                .map(
                  (row) => `
                    <tr>
                      ${Array.from(
                        { length: trackingColumnCount },
                        (_, columnIndex) => {
                          const item = row[columnIndex];

                          return item
                            ? `
                              <td width="${trackingColumnWidth}" style="padding: 9px 8px; border-top: 1px solid #e2e8f0; border-right: ${columnIndex < trackingColumnCount - 1 ? "1px solid #e2e8f0" : "0"}; color: #0f172a; font-family: Consolas, 'Courier New', monospace; font-size: 11px; font-weight: 700; line-height: 1.35; vertical-align: top; word-break: break-all;">
                                <strong style="color: #2563eb;">${item.number}.</strong>
                                ${escapeHtml(item.codigo_rastreio)}
                              </td>
                            `
                            : `<td width="${trackingColumnWidth}" style="padding: 9px 8px; border-top: 1px solid #e2e8f0; border-right: ${columnIndex < trackingColumnCount - 1 ? "1px solid #e2e8f0" : "0"};">&nbsp;</td>`;
                        },
                      ).join("")}
                    </tr>
                  `,
                )
                .join("")
            : `<tr><td colspan="${trackingColumnCount}" style="padding: 16px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; text-align: center;">Nenhum pacote nesta loja.</td></tr>`;

          return `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 24px; background-color: #ffffff; border: 1px solid #cbd5e1; border-collapse: separate; border-spacing: 0;">
              <tr>
                <td style="padding: 20px 22px; background-color: #172554;">
                  <p style="margin: 0 0 5px; color: #bfdbfe; font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;">Loja</p>
                  <h2 class="romaneio-store-name" style="margin: 0; color: #ffffff; font-size: 25px; font-weight: 800; line-height: 1.2; text-align: center;">${escapeHtml(group.loja_nome)}</h2>
                </td>
              </tr>
              <tr>
                <td style="padding: 13px 22px; background-color: #f0fdfa; border-bottom: 2px solid #0d9488;">
                  <p style="margin: 0 0 4px; color: #0f766e; font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;">Marketplace</p>
                  <p style="margin: 0; color: #134e4a; font-size: 18px; font-weight: 800; line-height: 1.25;">${escapeHtml(group.marketplace)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 14px 20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="65%" style="padding: 5px 12px 5px 0; color: #64748b; font-size: 11px; vertical-align: top;">
                        PERÍODO<br /><strong style="color: #0f172a; font-size: 13px;">${escapeHtml(group.periodo)}</strong>
                      </td>
                      <td width="35%" style="padding: 5px 0 5px 12px; color: #64748b; font-size: 11px; vertical-align: top;">
                        TOTAL DE PACOTES<br /><strong style="color: #0f172a; font-size: 13px;">${escapeHtml(group.pacotes.length)}</strong>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 0 20px 18px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e2e8f0; border-collapse: separate; border-spacing: 0;">
                    <tr>
                      <td colspan="${trackingColumnCount}" style="padding: 8px 10px; background-color: #f8fafc; color: #475569; font-size: 10px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase;">Rastreios · ${trackingColumnCount} por linha</td>
                    </tr>
                    ${rows}
                  </table>
                  <p style="margin: 18px 0 22px; color: #475569; font-size: 11px; line-height: 1.5;">Confirmamos a entrega e o recebimento dos pacotes relacionados neste romaneio.</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="48%" style="padding: 24px 8px 0 0; border-top: 1px solid #64748b; color: #0f172a; font-size: 11px; font-weight: 700; text-align: center;">Transportadora</td>
                      <td width="4%"></td>
                      <td width="48%" style="padding: 24px 0 0 8px; border-top: 1px solid #64748b; color: #0f172a; font-size: 11px; font-weight: 700; text-align: center;">Responsável pela expedição</td>
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
                <strong style="color: #0f172a; font-size: 16px;">Romaneios de pacotes</strong><br />${escapeHtml(formatPackageCount(totalPacotes))} em ${escapeHtml(groups.length)} ${groups.length === 1 ? "romaneio" : "romaneios"}
              </td>
            </tr>
            <tr><td>${groupsHtml}</td></tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = [
    "ROMANEIO DE PACOTES",
    `Total geral: ${formatPackageCount(totalPacotes)}`,
    "",
    ...groups.flatMap((group) => {
      const trackingColumnCount = getRomaneioTrackingColumnCount(
        group.pacotes,
      );

      return [
        `LOJA: ${group.loja_nome}`,
        `MARKETPLACE: ${group.marketplace}`,
        `Período: ${group.periodo}`,
        `Total: ${formatPackageCount(group.pacotes.length)}`,
        `Rastreios (${trackingColumnCount} por linha):`,
        ...chunkTrackingItems(group.pacotes, trackingColumnCount).map(
          (row, rowIndex) =>
            row
              .map(
                (item, columnIndex) =>
                  `${rowIndex * trackingColumnCount + columnIndex + 1}. ${item.codigo_rastreio}`,
              )
              .join(" | "),
        ),
        "",
        "Transportadora: ______________________________",
        "Responsável pela expedição: ___________________",
        "",
      ];
    }),
  ].join("\n");

  return { subject, html, text };
}

function buildReportEmail(payload: Record<string, unknown>): EmailContent {
  const subject =
    getOptionalString(payload.assunto) || "Relatório de Despacho";
  const filtrosResumo = isRecord(payload.filtrosResumo)
    ? payload.filtrosResumo
    : {};
  const relatorio = isRecord(payload.relatorio) ? payload.relatorio : {};
  const totalPacotes = getPackageCount(relatorio.totalPacotes);
  const modo = getOptionalString(relatorio.modo) || "resumido";
  if (modo === "romaneio") {
    return buildRomaneioEmail(payload, relatorio);
  }

  const summaryEntries = getReportSummaryEntries(relatorio);
  const filterItems = Object.entries(filtrosResumo);

  const operationSections = operationThemes
    .map((theme) => {
      const items = summaryEntries.filter(
        (entry) => entry.operation === theme.key,
      );

      return {
        ...theme,
        items,
        marketplaces: groupEntriesByMarketplace(items),
        total: items.reduce((sum, item) => sum + item.packages, 0),
      };
    })
    .filter((section) => section.items.length > 0);
  const coletaTotal =
    operationSections.find((section) => section.key === "coleta")?.total ?? 0;
  const postagemTotal =
    operationSections.find((section) => section.key === "postagem")?.total ?? 0;

  const filterHtml = filterItems.length
    ? filterItems
        .map(
          ([key, value]) => `
            <tr>
              <td style="padding: 5px 12px 5px 0; color: #64748b; font-size: 12px; vertical-align: top; white-space: nowrap;">${escapeHtml(key)}</td>
              <td style="padding: 5px 0; color: #0f172a; font-size: 12px; font-weight: 700; vertical-align: top;">${escapeHtml(value)}</td>
            </tr>
          `,
        )
        .join("")
    : '<tr><td style="padding: 5px 0; color: #64748b; font-size: 12px;">Nenhum filtro informado.</td></tr>';

  const operationSectionsHtml = operationSections.length
    ? operationSections
        .map((section) => {
          const marketplacesHtml = section.marketplaces
            .map((marketplace) => {
              const compactedItems = compactShippingDetails(
                marketplace.items,
              );
              const detailRows = compactedItems.visible
                .map((item) => {
                  const compactedStores = compactStores(item.lojas);
                  const storesHtml = compactedStores.visible.length
                    ? `
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          ${compactedStores.visible
                            .map(
                              (loja) => `
                                <tr>
                                  <td style="padding: 1px 8px 1px 0; color: #475569; font-size: 12px;">${escapeHtml(loja.nome)}</td>
                                  <td align="right" style="padding: 1px 0; color: #0f172a; font-size: 12px; font-weight: 700; white-space: nowrap;">${escapeHtml(loja.packages)}</td>
                                </tr>
                              `,
                            )
                            .join("")}
                          ${
                            compactedStores.omittedCount
                              ? `
                                  <tr>
                                    <td colspan="2" style="padding: 5px 0 0; color: #b45309; font-size: 10px; line-height: 1.4;">
                                      + ${escapeHtml(compactedStores.omittedCount)} lojas resumidas (${escapeHtml(formatPackageCount(compactedStores.omittedPackages))})
                                    </td>
                                  </tr>
                                `
                              : ""
                          }
                        </table>
                      `
                    : '<span style="color: #94a3b8; font-size: 12px;">Sem detalhamento por loja</span>';
                  const shippingLabel = item.melhorEnvio
                    ? "Melhor Envio"
                    : "Envio direto";

                  return `
                    <tr>
                      <td style="padding: 12px; border-top: 1px solid #e2e8f0; vertical-align: top;">
                        <strong style="display: block; color: #0f172a; font-size: 13px;">${shippingLabel}</strong>
                        <span style="color: #64748b; font-size: 12px;">${escapeHtml(item.transportadora)}</span>
                      </td>
                      <td align="center" style="padding: 12px; border-top: 1px solid #e2e8f0; color: #0f172a; font-size: 15px; font-weight: 700; vertical-align: top; white-space: nowrap;">${escapeHtml(item.packages)}</td>
                      <td style="padding: 12px; border-top: 1px solid #e2e8f0; vertical-align: top;">${storesHtml}</td>
                    </tr>
                  `;
                })
                .join("");
              const omittedDetailsRow = compactedItems.omittedCount
                ? `
                    <tr>
                      <td colspan="3" style="padding: 10px 12px; border-top: 1px solid #e2e8f0; background-color: #fffbeb; color: #92400e; font-size: 11px; line-height: 1.4;">
                        Mais ${escapeHtml(compactedItems.omittedCount)} formas de envio foram resumidas (${escapeHtml(formatPackageCount(compactedItems.omittedPackages))}). Os totais do marketplace permanecem completos.
                      </td>
                    </tr>
                  `
                : "";

              return `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 16px; border: 1px solid #e2e8f0; border-collapse: separate; border-spacing: 0; border-radius: 8px; overflow: hidden;">
                  <tr>
                    <td colspan="3" style="padding: 12px 14px; background-color: #f8fafc;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="color: #0f172a; font-size: 15px; font-weight: 700;">${escapeHtml(marketplace.marketplace)}</td>
                          <td align="right" style="color: #475569; font-size: 12px; font-weight: 700; white-space: nowrap;">${escapeHtml(formatPackageCount(marketplace.total))}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr style="background-color: #ffffff;">
                    <th align="left" width="35%" style="padding: 8px 12px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase;">Envio / transportadora</th>
                    <th align="center" width="15%" style="padding: 8px 12px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase;">Pacotes</th>
                    <th align="left" width="50%" style="padding: 8px 12px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase;">Por loja</th>
                  </tr>
                  ${detailRows}
                  ${omittedDetailsRow}
                </table>
              `;
            })
            .join("");

          return `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0 12px; border-collapse: separate; border-spacing: 0;">
              <tr>
                <td style="padding: 12px 14px; background-color: ${section.background}; border: 1px solid ${section.border}; color: ${section.color}; font-size: 16px; font-weight: 700;">${escapeHtml(section.label)}</td>
                <td align="right" style="padding: 12px 14px; background-color: ${section.background}; border-top: 1px solid ${section.border}; border-right: 1px solid ${section.border}; border-bottom: 1px solid ${section.border}; color: ${section.color}; font-size: 13px; font-weight: 700; white-space: nowrap;">${escapeHtml(formatPackageCount(section.total))}</td>
              </tr>
            </table>
            ${marketplacesHtml}
          `;
        })
        .join("")
    : `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; color: #64748b; font-size: 13px; text-align: center;">Nenhum dado encontrado para os filtros aplicados.</td>
          </tr>
        </table>
      `;

  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin: 0; background-color: #f1f5f9; font-family: Arial, Helvetica, sans-serif;">
      <tr>
        <td align="center" style="padding: 24px 12px;">
          <table role="presentation" width="720" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 720px; background-color: #ffffff; border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden;">
            <tr>
              <td style="padding: 24px; background-color: #172554;">
                <p style="margin: 0 0 6px; color: #bfdbfe; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">Sistema de despacho</p>
                <h1 style="margin: 0; color: #ffffff; font-size: 24px; line-height: 1.25;">Relatório de pacotes</h1>
                <p style="margin: 8px 0 0; color: #dbeafe; font-size: 13px; line-height: 1.5;">Coletas e postagens organizadas por marketplace</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 24px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: separate; border-spacing: 6px;">
                  <tr>
                    <td width="34%" align="center" style="padding: 14px 8px; background-color: #f8fafc; border: 1px solid #e2e8f0;">
                      <strong style="display: block; color: #0f172a; font-size: 22px; line-height: 1.1;">${escapeHtml(totalPacotes)}</strong>
                      <span style="color: #64748b; font-size: 11px;">Total geral</span>
                    </td>
                    <td width="33%" align="center" style="padding: 14px 8px; background-color: #ccfbf1; border: 1px solid #99f6e4;">
                      <strong style="display: block; color: #115e59; font-size: 22px; line-height: 1.1;">${escapeHtml(coletaTotal)}</strong>
                      <span style="color: #0f766e; font-size: 11px;">Coleta</span>
                    </td>
                    <td width="33%" align="center" style="padding: 14px 8px; background-color: #dbeafe; border: 1px solid #bfdbfe;">
                      <strong style="display: block; color: #1e40af; font-size: 22px; line-height: 1.1;">${escapeHtml(postagemTotal)}</strong>
                      <span style="color: #1d4ed8; font-size: 11px;">Postagem</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 16px 24px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0;">
                  <tr>
                    <td style="padding: 12px 14px;">
                      <p style="margin: 0 0 5px; color: #334155; font-size: 11px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase;">Filtros aplicados</p>
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">${filterHtml}</table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 24px 8px;">${operationSectionsHtml}</td>
            </tr>
            <tr>
              <td style="padding: 16px 24px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 11px; text-align: center;">Relatório gerado automaticamente pelo sistema de despacho.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = [
    "RELATÓRIO DE PACOTES",
    `Total geral: ${totalPacotes} pacotes`,
    `Coleta: ${coletaTotal} pacotes`,
    `Postagem: ${postagemTotal} pacotes`,
    "",
    "FILTROS APLICADOS",
    ...filterItems.map(([key, value]) => `${key}: ${String(value ?? "")}`),
    "",
    ...operationSections.flatMap((section) => [
      `${section.label.toUpperCase()} — ${formatPackageCount(section.total)}`,
      ...section.marketplaces.flatMap((marketplace) => {
        const compactedItems = compactShippingDetails(marketplace.items);

        return [
          `  ${marketplace.marketplace} — ${formatPackageCount(marketplace.total)}`,
          ...compactedItems.visible.map((item) => {
            const compactedStores = compactStores(item.lojas);
            const lojasText = compactedStores.visible.length
              ? compactedStores.visible
                  .map((loja) => `${loja.nome}: ${loja.packages}`)
                  .join(", ")
              : "Sem detalhamento por loja";
            const omittedStoresText = compactedStores.omittedCount
              ? `; + ${compactedStores.omittedCount} lojas resumidas (${formatPackageCount(compactedStores.omittedPackages)})`
              : "";
            const shippingLabel = item.melhorEnvio
              ? "Melhor Envio"
              : "Envio direto";

            return `    ${shippingLabel} | ${item.transportadora} | ${formatPackageCount(item.packages)} | Por loja: ${lojasText}${omittedStoresText}`;
          }),
          ...(compactedItems.omittedCount
            ? [
                `    + ${compactedItems.omittedCount} formas de envio resumidas (${formatPackageCount(compactedItems.omittedPackages)}); totais preservados.`,
              ]
            : []),
        ];
      }),
      "",
    ]),
  ].join("\n");

  return { subject, html, text };
}

async function sendEmailWithResend({
  to,
  subject,
  html,
  text,
}: EmailContent & { to: string[] }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RELATORIOS_EMAIL_FROM?.trim();
  const replyTo = process.env.RELATORIOS_EMAIL_REPLY_TO?.trim();

  if (!apiKey || !from) {
    logReportEmailFailure({
      kind: "configuration",
      apiKeyConfigured: Boolean(apiKey),
      senderConfigured: Boolean(from),
    });
    throw new EmailConfigError();
  }

  let response: Response;

  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(RESEND_EMAIL_TIMEOUT_MS),
    });
  } catch (error) {
    logReportEmailFailure({
      kind: isEmailTimeoutError(error) ? "timeout" : "network",
    });
    throw new EmailDeliveryError();
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    logReportEmailFailure({ kind: "provider", status: response.status });
    throw new EmailDeliveryError();
  }

  await response.body?.cancel().catch(() => undefined);
}

async function saveHistory({
  destinatarios,
  assunto,
  filtros,
  status,
  erro,
}: {
  destinatarios: string[];
  assunto: string;
  filtros: Record<string, unknown>;
  status: "sucesso" | "erro";
  erro?: string | null;
}, context: DatabaseContext) {
  try {
    await createRelatorioEnvioHistorico({
      destinatarios,
      assunto,
      filtros,
      status,
      erro,
    }, context);
  } catch (historyError) {
    console.error("Falha ao salvar historico de envio:", historyError);
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Supabase nao configurado." },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return NextResponse.json(
      { ok: false, message: "Sessao obrigatoria para enviar o relatorio." },
      { status: 401 },
    );
  }

  const authenticatedClient = createSupabaseClientForAccessToken(token);
  const { data: userData, error: userError } =
    await authenticatedClient.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json(
      { ok: false, message: "Sessao invalida ou expirada. Entre novamente." },
      { status: 401 },
    );
  }

  // O envio pelo provedor externo acontece antes de o histórico ser salvo.
  // Confirme a permissão aqui, porque a RLS não consegue desfazer um e-mail
  // que já tenha sido entregue pelo provedor.
  const { data: canWrite, error: permissionError } =
    await authenticatedClient.rpc("current_account_can_write");

  if (permissionError || canWrite !== true) {
    return NextResponse.json(
      {
        ok: false,
        message: "Seu perfil possui acesso somente para consulta.",
      },
      { status: 403 },
    );
  }

  const databaseContext: DatabaseContext = {
    supabase: authenticatedClient,
    userId: userData.user.id,
  };

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Payload invalido." },
      { status: 400 },
    );
  }

  if (!isRecord(payload)) {
    return NextResponse.json(
      { ok: false, message: "Payload invalido." },
      { status: 400 },
    );
  }

  const destinatarioIds = unique(getStringArray(payload.destinatarioIds));
  let emailsManuais: string[];
  try {
    emailsManuais = unique(
      getStringArray(payload.emailsManuais).map((email) =>
        validateEmailAddress(email),
      ),
    );
  } catch (validationError) {
    return NextResponse.json(
      { ok: false, message: formatDatabaseError(validationError) },
      { status: 400 },
    );
  }

  let ativos: Awaited<ReturnType<typeof getRelatorioDestinatarios>>;
  try {
    ativos = await getRelatorioDestinatarios(undefined, databaseContext);
  } catch (databaseError) {
    return NextResponse.json(
      {
        ok: false,
        message: `Erro ao carregar destinatarios: ${formatDatabaseError(databaseError)}`,
      },
      { status: 500 },
    );
  }

  const ativosPorId = new Map(ativos.map((item) => [item.id, item]));
  const destinatariosCadastrados = destinatarioIds.flatMap((id) => {
    const item = ativosPorId.get(id);

    return item ? [item.email] : [];
  });
  const destinatarios = unique([...destinatariosCadastrados, ...emailsManuais]);
  let emailContent: EmailContent;
  try {
    emailContent = buildReportEmail(payload);
  } catch (error) {
    if (error instanceof ReportPayloadError) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 409 },
      );
    }

    throw error;
  }
  const filtros = {
    filtros: isRecord(payload.filtros) ? payload.filtros : {},
    filtrosResumo: isRecord(payload.filtrosResumo) ? payload.filtrosResumo : {},
    relatorio: isRecord(payload.relatorio) ? payload.relatorio : {},
  };

  if (!destinatarios.length) {
    return NextResponse.json(
      {
        ok: false,
        message: "Selecione ao menos um destinatario ativo para enviar.",
      },
      { status: 400 },
    );
  }

  if (destinatarios.length > 50) {
    return NextResponse.json(
      {
        ok: false,
        message: "O envio aceita no maximo 50 destinatarios por vez.",
      },
      { status: 400 },
    );
  }

  try {
    await sendEmailWithResend({ ...emailContent, to: destinatarios });
    await saveHistory({
      destinatarios,
      assunto: emailContent.subject,
      filtros,
      status: "sucesso",
    }, databaseContext);

    return NextResponse.json({
      ok: true,
      totalDestinatarios: destinatarios.length,
    });
  } catch (error) {
    const message = formatDatabaseError(error);
    await saveHistory({
      destinatarios,
      assunto: emailContent.subject,
      filtros,
      status: "erro",
      erro: message,
    }, databaseContext);

    return NextResponse.json(
      { ok: false, message },
      {
        status:
          error instanceof EmailConfigError
            ? 503
            : error instanceof EmailDeliveryError
              ? 502
              : 500,
      },
    );
  }
}
