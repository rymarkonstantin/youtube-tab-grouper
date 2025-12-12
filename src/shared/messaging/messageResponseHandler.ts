import { validateResponse, type MessageAction } from "../messageContracts";
import { toErrorMessage } from "../utils/errorUtils";

export interface MessageResponseOptions {
  timeoutMs?: number;
  validateResponse?: boolean;
}

/**
 * Handle message response with validation and error normalization.
 * 
 * This function standardizes error handling for message responses across
 * content scripts and UI pages, handling validation errors, timeouts,
 * and disabled extension states consistently.
 * 
 * @param action - The message action that was sent
 * @param response - The response received (or null if error occurred)
 * @param error - The error that occurred (if any)
 * @param options - Options for response handling
 * @returns A normalized response with success/error structure
 * 
 * @example
 * try {
 *   const response = await client.sendMessage(MESSAGE_ACTIONS.GROUP_TAB, {});
 *   return handleMessageResponse(MESSAGE_ACTIONS.GROUP_TAB, response, null, { timeoutMs: 5000 });
 * } catch (error) {
 *   return handleMessageResponse(MESSAGE_ACTIONS.GROUP_TAB, null, error, { timeoutMs: 5000 });
 * }
 */
export function handleMessageResponse<T extends { success?: boolean; error?: string }>(
  action: MessageAction,
  response: unknown,
  error: unknown | null,
  options: MessageResponseOptions = {}
): T {
  const { timeoutMs, validateResponse: shouldValidate = true } = options;

  // Handle thrown errors
  if (error) {
    const message = toErrorMessage(error);

    if (/disabled/i.test(message)) {
      return { success: false, error: "Extension is disabled" } as T;
    }

    if (/timed out/i.test(message) && timeoutMs) {
      return {
        success: false,
        error: `Message timed out after ${timeoutMs}ms`
      } as T;
    }

    return { success: false, error: message } as T;
  }

  // Validate response if enabled
  if (shouldValidate && response) {
    const validation = validateResponse(action, response);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join("; ") || "Invalid response"
      } as T;
    }
  }

  return response as T;
}
