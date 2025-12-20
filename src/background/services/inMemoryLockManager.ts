import type { LockManagerPort } from "../ports/tabGrouping";

export class InMemoryLockManager implements LockManagerPort {
  private locks = new Map<string, Promise<void>>();

  async runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(
      key,
      previous.then(() => current)
    );

    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(key) === current) {
        this.locks.delete(key);
      }
    }
  }
}
