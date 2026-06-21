import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  "Supabase nao configurado. Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.local.";

export function getSupabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "",
  };
}

export function isSupabaseConfigured() {
  const { url, publishableKey } = getSupabaseConfig();

  return Boolean(url && publishableKey);
}

export function getSupabaseClient() {
  const { url, publishableKey } = getSupabaseConfig();

  if (!url || !publishableKey) {
    throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
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
