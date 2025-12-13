import { toErrorMessage } from "../../shared/utils/errorUtils";
import { logError, toErrorEnvelope } from "../logger";

interface ErrorHandlingOptions<T> {
  fallbackMessage?: string;
  mapError?: (error: unknown) => T;
}

export async function runWithErrorHandling<T>(
  context: string,
  operation: () => Promise<T>,
  options: ErrorHandlingOptions<T> = {}
): Promise<T> {
  const { fallbackMessage, mapError } = options;

  try {
    return await operation();
  } catch (error) {
    const message = fallbackMessage ?? `${context} failed`;
    logError(`[${context}]`, toErrorMessage(error, message));

    if (mapError) {
      return mapError(error);
    }

    throw toErrorEnvelope(error, message);
  }
}
