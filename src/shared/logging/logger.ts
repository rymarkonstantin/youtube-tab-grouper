export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  console?: Console;
  timestamp?: () => string;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100
};

const defaultTimestamp = () => new Date().toISOString();

export class Logger {
  private level: LogLevel;
  private prefix?: string;
  private console: Console;
  private timestamp: () => string;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? "info";
    this.prefix = options.prefix;
    this.console = options.console ?? console;
    this.timestamp = options.timestamp ?? defaultTimestamp;
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  child(options: Partial<LoggerOptions> = {}) {
    return new Logger({
      level: options.level ?? this.level,
      prefix: options.prefix ?? this.prefix,
      console: options.console ?? this.console,
      timestamp: options.timestamp ?? this.timestamp
    });
  }

  debug(...args: unknown[]) {
    this.emit("debug", args);
  }

  info(...args: unknown[]) {
    this.emit("info", args);
  }

  warn(...args: unknown[]) {
    this.emit("warn", args);
  }

  error(...args: unknown[]) {
    this.emit("error", args);
  }

  private emit(level: LogLevel, args: unknown[]) {
    if (!this.shouldLog(level)) return;
    const method = this.console?.[level] ? level : "log";
    const fn = this.console?.[method as keyof Console];
    if (typeof fn !== "function") return;
    const parts: unknown[] = [this.timestamp()];
    if (this.prefix) parts.push(this.prefix);
    parts.push(...args);
    fn.apply(this.console, parts);
  }

  private shouldLog(level: LogLevel) {
    return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[this.level];
  }
}

export const createLogger = (options?: LoggerOptions) => new Logger(options);
