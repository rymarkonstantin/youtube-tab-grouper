import type { EnvelopedError } from "../../shared/utils/errors";
import { withErrorHandling } from "../../shared/utils/errors";
import { logError } from "../logger";

interface ErrorHandlingOptions<T> {
  fallbackMessage?: string;
  mapError?: (error: EnvelopedError, originalError?: unknown) => T;
}

export async function runWithErrorHandling<T>(
  context: string,
  operation: () => Promise<T>,
  options: ErrorHandlingOptions<T> = {}
): Promise<T> {
  const { fallbackMessage, mapError } = options;

  return withErrorHandling(context, operation, {
    logger: { error: (...args: unknown[]) => logError(...args) },
    message: fallbackMessage,
    domain: "runtime",
    mapError: mapError
      ? (wrapped, original) => {
          return mapError(wrapped, original);
        }
      : undefined
  });
}
