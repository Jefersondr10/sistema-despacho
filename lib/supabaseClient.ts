import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function getSupabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  };
}

export function isSupabaseConfigured() {
  const { url, publishableKey } = getSupabaseConfig();

  return Boolean(url && publishableKey);
}

export function getSupabaseClient() {
  const { url, publishableKey } = getSupabaseConfig();

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase não configurado. Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  if (!cachedClient) {
    cachedClient = createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return cachedClient;
}
