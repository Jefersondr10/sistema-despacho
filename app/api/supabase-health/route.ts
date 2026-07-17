import { NextResponse } from "next/server";

import { getLojas, type DatabaseContext } from "@/lib/database";
import {
  createSupabaseClientForAccessToken,
  isSupabaseConfigured,
} from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        message:
          "Supabase nao configurado. Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return NextResponse.json(
      { ok: false, configured: true, message: "Sessao obrigatoria." },
      { status: 401 },
    );
  }

  const supabase = createSupabaseClientForAccessToken(token);
  const { data, error: userError } = await supabase.auth.getUser(token);
  if (userError || !data.user) {
    return NextResponse.json(
      { ok: false, configured: true, message: "Sessao invalida ou expirada." },
      { status: 401 },
    );
  }

  try {
    const context: DatabaseContext = { supabase, accessToken: token };
    await getLojas({ incluirInativos: true, limit: 1 }, context);

    return NextResponse.json({ ok: true, configured: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        message: error instanceof Error ? error.message : "Falha ao consultar Supabase.",
      },
      { status: 500 },
    );
  }
}
