export type Result<T, E = Error> = Ok<T> | Err<E>;
export type Outcome<T, E = Error> = Result<T, E>;

export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<E = Error> {
  ok: false;
  error: E;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E = Error>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E = Error>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

export function isErr<T, E = Error>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

export function map<T, U, E = Error>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return isOk(result) ? ok(fn(result.value)) : result;
}

export function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return isErr(result) ? err(fn(result.error)) : result;
}

export function unwrapOr<T, E = Error>(result: Result<T, E>, fallback: T): T {
  return isOk(result) ? result.value : fallback;
}
