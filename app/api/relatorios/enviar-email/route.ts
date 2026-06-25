import { NextResponse } from "next/server";

import {
  createRelatorioEnvioHistorico,
  formatDatabaseError,
  getRelatorioDestinatarios,
  validateEmailAddress,
} from "@/lib/database";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";

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

  return String(value ?? "");
}

function getSummaryStores(item: Record<string, unknown>) {
  const lojas = Array.isArray(item.lojas) ? item.lojas.filter(isRecord) : [];

  return lojas.map((loja) => ({
    nome: getOptionalString(loja.loja_nome) || "Loja nao informada",
    packages: typeof loja.packages === "number" ? loja.packages : 0,
  }));
}

function buildReportEmail(payload: Record<string, unknown>): EmailContent {
  const subject =
    getOptionalString(payload.assunto) || "Relatório de Despacho";
  const filtrosResumo = isRecord(payload.filtrosResumo)
    ? payload.filtrosResumo
    : {};
  const relatorio = isRecord(payload.relatorio) ? payload.relatorio : {};
  const totalPacotes =
    typeof relatorio.totalPacotes === "number" ? relatorio.totalPacotes : 0;
  const modo = getOptionalString(relatorio.modo) || "resumido";
  const resumo = Array.isArray(relatorio.resumo) ? relatorio.resumo : [];
  const resumoRows = resumo.filter(isRecord).slice(0, 40);
  const filterItems = Object.entries(filtrosResumo);

  const filterHtml = filterItems.length
    ? filterItems
        .map(
          ([key, value]) =>
            `<li><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</li>`,
        )
        .join("")
    : "<li>Nenhum filtro informado.</li>";

  const summaryRowsHtml = resumoRows.length
    ? resumoRows
        .map((item) => {
          const lojasHtml =
            getSummaryStores(item)
              .map(
                (loja) =>
                  `${escapeHtml(loja.nome)}: <strong>${escapeHtml(loja.packages)}</strong>`,
              )
              .join("<br />") || "Sem detalhamento";

          return `
            <tr>
              <td>${escapeHtml(item.marketplace)}</td>
              <td>${escapeHtml(getOperationLabel(item.tipo_operacao))}</td>
              <td>${escapeHtml(item.melhor_envio ? "Sim" : "Não")}</td>
              <td>${escapeHtml(item.melhor_envio ? item.transportadora || "Não informada" : "Sem Melhor Envio")}</td>
              <td style="text-align:right">${escapeHtml(item.packages)}</td>
              <td>${lojasHtml}</td>
            </tr>
          `;
        })
        .join("")
    : `
        <tr>
          <td colspan="6">Nenhum dado encontrado para os filtros aplicados.</td>
        </tr>
      `;

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5">
      <h1 style="font-size: 22px; margin: 0 0 12px">Relatório de Despacho</h1>
      <p style="margin: 0 0 16px">Modo: <strong>${escapeHtml(modo)}</strong></p>
      <p style="margin: 0 0 16px">Total geral: <strong>${escapeHtml(totalPacotes)}</strong> pacotes.</p>

      <h2 style="font-size: 16px; margin: 24px 0 8px">Filtros</h2>
      <ul>${filterHtml}</ul>

      <h2 style="font-size: 16px; margin: 24px 0 8px">Resumo agrupado</h2>
      <table cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; font-size: 14px">
        <thead>
          <tr style="background: #f8fafc">
            <th align="left">Marketplace</th>
            <th align="left">Operação</th>
            <th align="left">Melhor Envio</th>
            <th align="left">Transportadora</th>
            <th align="right">Pacotes</th>
            <th align="left">Por loja</th>
          </tr>
        </thead>
        <tbody>${summaryRowsHtml}</tbody>
      </table>
    </div>
  `;

  const text = [
    "Relatório de Despacho",
    `Modo: ${modo}`,
    `Total geral: ${totalPacotes} pacotes`,
    "",
    "Filtros:",
    ...filterItems.map(([key, value]) => `${key}: ${String(value ?? "")}`),
    "",
    "Resumo agrupado:",
    ...resumoRows.map((item) => {
      const lojasText =
        getSummaryStores(item)
          .map((loja) => `${loja.nome}: ${loja.packages}`)
          .join(", ") || "Sem detalhamento";

      return `${String(item.marketplace ?? "")} | ${getOperationLabel(item.tipo_operacao)} | Melhor Envio: ${item.melhor_envio ? "Sim" : "Não"} | Transportadora: ${String(item.melhor_envio ? item.transportadora || "Não informada" : "Sem Melhor Envio")} | ${String(item.packages ?? 0)} pacotes | Por loja: ${lojasText}`;
    }),
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
    throw new EmailConfigError(
      "Envio de e-mail nao configurado. Defina RESEND_API_KEY e RELATORIOS_EMAIL_FROM no ambiente do backend.",
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
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
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Falha no provedor de e-mail (${response.status}): ${body || response.statusText}`,
    );
  }

  return response.json();
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
}) {
  try {
    await createRelatorioEnvioHistorico({
      destinatarios,
      assunto,
      filtros,
      status,
      erro,
    });
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
      { ok: false, message: "Sessao nao encontrada para enviar e-mail." },
      { status: 401 },
    );
  }

  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json(
      { ok: false, message: "Sessao invalida para enviar e-mail." },
      { status: 401 },
    );
  }

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
    ativos = await getRelatorioDestinatarios();
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
  const emailContent = buildReportEmail(payload);
  const filtros = {
    filtros: isRecord(payload.filtros) ? payload.filtros : {},
    filtrosResumo: isRecord(payload.filtrosResumo) ? payload.filtrosResumo : {},
    relatorio: isRecord(payload.relatorio) ? payload.relatorio : {},
    usuario: userData.user.email ?? userData.user.id,
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
    });

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
    });

    return NextResponse.json(
      { ok: false, message },
      { status: error instanceof EmailConfigError ? 501 : 500 },
    );
  }
}
