export type Token<T> = string | symbol | (new (...args: never[]) => T);

type Factory<T> = (container: Container) => T;

interface Registration<T> {
  singleton: boolean;
  factory?: Factory<T>;
  value?: T;
  instance?: T;
}

/**
 * Minimal DI container/registry for wiring services during the refactor.
 */
export class Container {
  private registry = new Map<Token<unknown>, Registration<unknown>>();
  private parent?: Container;

  constructor(parent?: Container) {
    this.parent = parent;
  }

  registerValue<T>(token: Token<T>, value: T) {
    this.registry.set(token, { singleton: true, value });
    return this;
  }

  registerFactory<T>(token: Token<T>, factory: Factory<T>, options: { singleton?: boolean } = {}) {
    this.registry.set(token, {
      singleton: options.singleton ?? false,
      factory
    });
    return this;
  }

  registerSingleton<T>(token: Token<T>, factory: Factory<T>) {
    return this.registerFactory(token, factory, { singleton: true });
  }

  has<T>(token: Token<T>): boolean {
    if (this.registry.has(token)) return true;
    return this.parent?.has(token) ?? false;
  }

  resolve<T>(token: Token<T>): T {
    const registration = this.registry.get(token) as Registration<T> | undefined;

    if (registration) {
      if (registration.value !== undefined) {
        return registration.value;
      }
      if (registration.singleton) {
        if (registration.instance === undefined) {
          registration.instance = this.instantiate(registration);
          this.registry.set(token, registration);
        }
        return registration.instance;
      }
      return this.instantiate(registration);
    }

    if (this.parent) {
      return this.parent.resolve(token);
    }

    // Lazy instantiate class tokens if unregistered and constructible
    if (typeof token === "function") {
      return new token();
    }

    throw new Error(`No registration found for token: ${String(token)}`);
  }

  createChild() {
    return new Container(this);
  }

  clear() {
    this.registry.clear();
  }

  private instantiate<T>(registration: Registration<T>) {
    if (typeof registration.factory !== "function") {
      throw new Error("Cannot instantiate unregistered token without a factory");
    }
    return registration.factory(this);
  }
}

export const rootContainer = new Container();
