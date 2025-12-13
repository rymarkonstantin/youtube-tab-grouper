import { toErrorMessage } from "../../shared/utils/errorUtils";
import { logDebug, logError, toErrorEnvelope } from "../logger";

interface WrappedError extends ReturnType<typeof toErrorEnvelope> {
  envelope?: ReturnType<typeof toErrorEnvelope>["envelope"];
}

interface WithErrorHandlingOptions<TResult> {
  context?: string;
  fallbackMessage?: string;
  mapError?: (error: WrappedError) => TResult;
}

export function withErrorHandling<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => Promise<TResult>,
  { context, fallbackMessage, mapError }: WithErrorHandlingOptions<TResult> = {}
) {
  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await handler(...args);
    } catch (error) {
      const envelopedError = toErrorEnvelope(error, fallbackMessage);
      const message = toErrorMessage(envelopedError);
      const label = context || handler.name || "handler";

      logError(`${label} failed:`, message);
      logDebug(`${label} stack:`, (envelopedError as Error).stack);

      if (mapError) {
        return mapError(envelopedError);
      }

      throw envelopedError;
    }
  };
}
