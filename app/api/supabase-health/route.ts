import { NextResponse } from "next/server";

import { getLojas } from "@/lib/database";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        message:
          "Supabase não configurado. Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      },
      { status: 503 },
    );
  }

  try {
    const lojas = await getLojas({ incluirInativos: true, limit: 1 });

    return NextResponse.json({
      ok: true,
      configured: true,
      lojasEncontradas: lojas.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        message:
          error instanceof Error
            ? error.message
            : "Falha ao consultar Supabase.",
      },
      { status: 500 },
    );
  }
}
