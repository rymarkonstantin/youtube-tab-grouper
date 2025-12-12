/**
 * Error handling utilities for converting various error types to standardized formats.
 */

/**
 * Convert any error value to a user-friendly error message string.
 * 
 * @param error - The error to convert (Error, string, or unknown)
 * @param context - Optional context prefix for the error message
 * @returns A string representation of the error
 * 
 * @example
 * toErrorMessage(new Error("Something went wrong")) // "Something went wrong"
 * toErrorMessage("Custom error", "validation") // "validation: Custom error"
 * toErrorMessage({ code: 500 }, "API") // "API: {"code":500}"
 */
export function toErrorMessage(error: unknown, context?: string): string {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else {
    try {
      message = JSON.stringify(error);
    } catch {
      message = "Unknown error";
    }
  }

  return context ? `${context}: ${message}` : message;
}

/**
 * Convert any error value to an Error instance.
 * 
 * @param error - The error to convert (Error, string, or unknown)
 * @param context - Optional context prefix for the error message
 * @returns An Error instance
 * 
 * @example
 * toError(new Error("Something went wrong")) // Error("Something went wrong")
 * toError("Custom error", "validation") // Error("validation: Custom error")
 */
export function toError(error: unknown, context?: string): Error {
  if (error instanceof Error) {
    return context ? new Error(`${context}: ${error.message}`) : error;
  }
  if (typeof error === "string") {
    return new Error(context ? `${context}: ${error}` : error);
  }
  try {
    const message = JSON.stringify(error);
    return new Error(context ? `${context}: ${message}` : message);
  } catch {
    return new Error(context ? `${context}: Unknown error` : "Unknown error");
  }
}
