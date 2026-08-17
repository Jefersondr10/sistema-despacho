import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedDeliveryClient: SupabaseClient | null = null;
let cachedDeliveryIdentity = "";

export function getFeedbackDeliveryClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!url || !serviceRoleKey) {
    return null;
  }

  const identity = `${url}\u0000${serviceRoleKey}`;
  if (!cachedDeliveryClient || cachedDeliveryIdentity !== identity) {
    try {
      cachedDeliveryClient = createClient(url, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      });
      cachedDeliveryIdentity = identity;
    } catch {
      return null;
    }
  }

  return cachedDeliveryClient;
}
