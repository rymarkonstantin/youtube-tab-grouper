import { type Logger, createLogger } from "../logging/logger";

export type ErrorDomain =
  | "messaging"
  | "network"
  | "runtime"
  | "settings"
  | "storage"
  | "tabs"
  | "validation"
  | "unknown";

export const ERROR_CODES = {
  BAD_REQUEST: "bad_request",
  CONFLICT: "conflict",
  FORBIDDEN: "forbidden",
  INTERNAL: "internal_error",
  MESSAGING: "messaging_error",
  NOT_FOUND: "not_found",
  RATE_LIMITED: "rate_limited",
  RUNTIME: "runtime_error",
  SETTINGS: "settings_error",
  STORAGE: "storage_error",
  TABS: "tab_error",
  TIMEOUT: "timeout",
  UNAUTHORIZED: "unauthorized",
  UNAVAILABLE: "service_unavailable",
  UNKNOWN: "unknown_error",
  VALIDATION: "validation_error"
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ErrorDetails = Record<string, unknown>;

export interface ErrorContext<TDetails extends ErrorDetails = ErrorDetails> {
  code?: ErrorCode;
  cause?: unknown;
  details?: TDetails;
  domain?: ErrorDomain;
  message?: string;
  status?: number;
}

export interface ErrorEnvelope<TDetails extends ErrorDetails = ErrorDetails> extends ErrorContext<TDetails> {
  code: ErrorCode;
  message: string;
  cause?: string;
}

export type EnvelopedError<TDetails extends ErrorDetails = ErrorDetails> = Error & {
  envelope: ErrorEnvelope<TDetails>;
};

type LogTarget = Pick<Console, "error"> | Pick<Logger, "error">;
type DomainCodeMap = Partial<Record<number, ErrorCode>>;

const DEFAULT_DOMAIN_CODE: Record<ErrorDomain, ErrorCode> = {
  messaging: ERROR_CODES.MESSAGING,
  network: ERROR_CODES.INTERNAL,
  runtime: ERROR_CODES.RUNTIME,
  settings: ERROR_CODES.SETTINGS,
  storage: ERROR_CODES.STORAGE,
  tabs: ERROR_CODES.TABS,
  validation: ERROR_CODES.VALIDATION,
  unknown: ERROR_CODES.UNKNOWN
};

const STATUS_CODE_MAP: Record<number, ErrorCode> = {
  400: ERROR_CODES.BAD_REQUEST,
  401: ERROR_CODES.UNAUTHORIZED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  408: ERROR_CODES.TIMEOUT,
  409: ERROR_CODES.CONFLICT,
  429: ERROR_CODES.RATE_LIMITED,
  500: ERROR_CODES.INTERNAL,
  503: ERROR_CODES.UNAVAILABLE
};

const DOMAIN_STATUS_CODE_MAP: Record<ErrorDomain, DomainCodeMap> = {
  messaging: { 408: ERROR_CODES.TIMEOUT },
  network: STATUS_CODE_MAP,
  runtime: { 500: ERROR_CODES.INTERNAL },
  settings: {},
  storage: { 404: ERROR_CODES.NOT_FOUND },
  tabs: { 404: ERROR_CODES.NOT_FOUND },
  unknown: {},
  validation: { 400: ERROR_CODES.BAD_REQUEST }
};

const defaultErrorLogger = createLogger({ prefix: "[yt-grouper][errors]" });

const isError = (value: unknown): value is Error => value instanceof Error;

const stringifyFallback = (value: unknown, fallback = "Unknown error") => {
  if (typeof value === "string" && value.trim().length > 0) return value;
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
};

const extractStatus = (error: unknown): number | undefined => {
  if (typeof error !== "object" || !error) return undefined;
  const potential =
    (error as { status?: unknown; statusCode?: unknown; code?: unknown }).status ??
    (error as { status?: unknown; statusCode?: unknown; code?: unknown }).statusCode ??
    (error as { status?: unknown; statusCode?: unknown; code?: unknown }).code;
  const numeric = Number(potential);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const resolveDomain = (domain?: ErrorDomain, code?: ErrorCode): ErrorDomain => {
  if (domain) return domain;
  if (code === ERROR_CODES.VALIDATION) return "validation";
  if (code === ERROR_CODES.STORAGE) return "storage";
  if (code === ERROR_CODES.MESSAGING) return "messaging";
  if (code === ERROR_CODES.SETTINGS) return "settings";
  if (code === ERROR_CODES.TABS) return "tabs";
  if (code === ERROR_CODES.RUNTIME) return "runtime";
  return "unknown";
};

const resolveCode = (domain: ErrorDomain, status?: number, explicit?: ErrorCode) => {
  if (explicit) return explicit;
  const domainMapped = status ? DOMAIN_STATUS_CODE_MAP[domain]?.[status] : undefined;
  if (domainMapped) {
    return domainMapped;
  }
  if (status && STATUS_CODE_MAP[status]) {
    return STATUS_CODE_MAP[status];
  }
  return DEFAULT_DOMAIN_CODE[domain];
};

export function toErrorMessage(error: unknown, context?: string) {
  const message = isError(error) ? error.message : typeof error === "string" ? error : stringifyFallback(error);
  return context ? `${context}: ${message}` : message;
}

export function toError(error: unknown, context?: string): Error {
  if (isError(error) && !context) return error;
  const message = toErrorMessage(error, context);
  const normalized = isError(error) ? error : new Error(message);
  if (!isError(error)) {
    normalized.name = "Error";
  }
  if (context && isError(error)) {
    return new Error(message);
  }
  return normalized;
}

export function toErrorEnvelope<TDetails extends ErrorDetails = ErrorDetails>(
  error: unknown,
  context: string | ErrorContext<TDetails> = {}
): EnvelopedError<TDetails> {
  const normalizedError = toError(error);
  const options = typeof context === "string" ? { message: context } : context;
  const status = options.status ?? extractStatus(error);
  const domain = resolveDomain(options.domain, options.code);
  const code = resolveCode(domain, status, options.code);
  const cause = options.cause ?? (isError(error) ? (error as Error & { cause?: unknown }).cause : undefined);
  const envelope: ErrorEnvelope<TDetails> = {
    code,
    domain,
    message: options.message ?? normalizedError.message ?? "Unknown error",
    status,
    details: options.details,
    cause: cause ? toErrorMessage(cause) : undefined
  };

  const enriched = normalizedError as EnvelopedError<TDetails>;
  enriched.envelope = envelope;
  if (envelope.message && normalizedError.message !== envelope.message) {
    normalizedError.message = envelope.message;
  }
  return enriched;
}

export type DomainErrorFactory<TDetails extends ErrorDetails = ErrorDetails> = (
  message: unknown,
  options?: Partial<ErrorContext<TDetails>>
) => EnvelopedError<TDetails>;

export const createDomainErrorFactory =
  <TDetails extends ErrorDetails = ErrorDetails>(
    domain: ErrorDomain,
    defaults: Partial<ErrorContext<TDetails>> = {}
  ): DomainErrorFactory<TDetails> =>
  (message, options = {}) =>
    toErrorEnvelope(message, {
      domain,
      ...defaults,
      ...options
    });

export const domainErrorFactories: Record<ErrorDomain, DomainErrorFactory> = {
  messaging: createDomainErrorFactory("messaging"),
  network: createDomainErrorFactory("network"),
  runtime: createDomainErrorFactory("runtime"),
  settings: createDomainErrorFactory("settings"),
  storage: createDomainErrorFactory("storage"),
  tabs: createDomainErrorFactory("tabs"),
  unknown: createDomainErrorFactory("unknown"),
  validation: createDomainErrorFactory("validation")
};

export interface WithErrorHandlingOptions<TResult = never, TDetails extends ErrorDetails = ErrorDetails>
  extends Partial<ErrorContext<TDetails>> {
  fallbackValue?: TResult;
  logger?: LogTarget;
  mapError?: (error: EnvelopedError<TDetails>, originalError: unknown) => TResult;
  rethrow?: boolean;
}

const getLogger = (logger?: LogTarget) => logger ?? defaultErrorLogger;

export async function withErrorHandling<T, TDetails extends ErrorDetails = ErrorDetails>(
  context: string,
  operation: () => Promise<T>,
  options: WithErrorHandlingOptions<T, TDetails> = {}
): Promise<T> {
  const { fallbackValue, logger, mapError, rethrow = true, ...envelopeOptions } = options;
  try {
    return await operation();
  } catch (error) {
    const mergedDetails = {
      ...((envelopeOptions.details as ErrorDetails | undefined) ?? {}),
      context
    } as unknown as TDetails;
    const wrapped = toErrorEnvelope<TDetails>(error, {
      ...envelopeOptions,
      message: envelopeOptions.message ?? `${context} failed`,
      details: mergedDetails
    });
    getLogger(logger).error(`[${context}] ${wrapped.envelope.message}`, wrapped.envelope);
    if (mapError) {
      return mapError(wrapped, error);
    }
    if (!rethrow) {
      return fallbackValue;
    }
    throw wrapped;
  }
}

export const wrapAsyncHandler =
  <Args extends unknown[], T, TDetails extends ErrorDetails = ErrorDetails>(
    context: string,
    handler: (...args: Args) => Promise<T>,
    options?: WithErrorHandlingOptions<T, TDetails>
  ) =>
  (...args: Args) =>
    withErrorHandling(context, () => handler(...args), options);
