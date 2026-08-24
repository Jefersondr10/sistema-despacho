type SupabaseErrorLike = {
  code?: unknown;
  message?: unknown;
};

type RetrySupabaseReadOptions = {
  delaysMs?: readonly number[];
  shouldContinue?: () => boolean;
  sleep?: (delayMs: number) => Promise<void>;
};

const DEFAULT_RETRY_DELAYS_MS = [1_000, 4_000, 10_000] as const;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error !== "object" || error === null) {
    return "";
  }

  const typedError = error as SupabaseErrorLike;
  return typeof typedError.message === "string" ? typedError.message : "";
}

function getErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = String((error as SupabaseErrorLike).code ?? "").trim();
  return code || null;
}

export function isJwtIssuedAtFutureError(error: unknown) {
  const messageMatches =
    getErrorMessage(error).trim().toLowerCase() === "jwt issued at future";
  const code = getErrorCode(error);

  return messageMatches && (code === null || code === "PGRST303");
}

function defaultSleep(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function retrySupabaseReadForJwtClockSkew<T>(
  read: () => Promise<T>,
  options: RetrySupabaseReadOptions = {},
) {
  const delaysMs = options.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const shouldContinue = options.shouldContinue ?? (() => true);
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      const delayMs = delaysMs[attempt];

      if (
        delayMs === undefined ||
        !isJwtIssuedAtFutureError(error) ||
        !shouldContinue()
      ) {
        throw error;
      }

      await sleep(delayMs);

      if (!shouldContinue()) {
        throw error;
      }
    }
  }
}
