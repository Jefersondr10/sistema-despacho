"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/app/_lib/auth-context";
import { formatDatabaseError, getFeedbackAdminStatus } from "@/lib/database";
import { retrySupabaseReadForJwtClockSkew } from "@/lib/supabase-jwt-retry";

export type FeedbackAdminAccessStatus =
  | "checking"
  | "allowed"
  | "denied"
  | "error";

type FeedbackAdminAccessValue = {
  status: FeedbackAdminAccessStatus;
  error: string;
  refresh: () => Promise<void>;
};

const FeedbackAdminAccessContext = createContext<
  FeedbackAdminAccessValue | undefined
>(undefined);

export function FeedbackAdminAccessProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { session, user } = useAuth();
  const requestIdRef = useRef(0);
  const resolvedUserIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<FeedbackAdminAccessStatus>("checking");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;
    const userId = user?.id;
    const accessToken = session?.access_token;

    if (!userId || !accessToken) {
      resolvedUserIdRef.current = null;
      setStatus("denied");
      setError("");
      return;
    }

    const keepsCurrentScreen = resolvedUserIdRef.current === userId;
    if (!keepsCurrentScreen) setStatus("checking");
    setError("");

    try {
      const admin = await retrySupabaseReadForJwtClockSkew(
        () => getFeedbackAdminStatus({ userId, accessToken }),
        { shouldContinue: isCurrent },
      );
      if (!isCurrent()) return;
      resolvedUserIdRef.current = userId;
      setStatus(admin ? "allowed" : "denied");
    } catch (loadError) {
      if (!isCurrent()) return;
      if (!keepsCurrentScreen) setStatus("error");
      setError(formatDatabaseError(loadError));
    }
  }, [session?.access_token, user?.id]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) void refresh();
    });

    return () => {
      cancelled = true;
      requestIdRef.current += 1;
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ status, error, refresh }),
    [error, refresh, status],
  );

  return (
    <FeedbackAdminAccessContext.Provider value={value}>
      {children}
    </FeedbackAdminAccessContext.Provider>
  );
}

export function useFeedbackAdminAccess() {
  const context = useContext(FeedbackAdminAccessContext);
  if (!context) {
    throw new Error(
      "useFeedbackAdminAccess deve ser usado dentro de FeedbackAdminAccessProvider.",
    );
  }

  return context;
}
