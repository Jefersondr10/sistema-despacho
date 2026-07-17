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
    const isBrowser = typeof window !== "undefined";

    cachedClient = createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: isBrowser,
        detectSessionInUrl: isBrowser,
        persistSession: isBrowser,
      },
    });
  }

  return cachedClient;
}

export function createSupabaseClientForAccessToken(accessToken: string) {
  const { url, publishableKey } = getSupabaseConfig();
  const token = accessToken.trim();

  if (!url || !publishableKey) {
    throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
  }

  if (!token) {
    throw new Error("Token de acesso obrigatorio.");
  }

  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
