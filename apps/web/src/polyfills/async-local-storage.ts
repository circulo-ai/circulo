// Minimal AsyncLocalStorage polyfill for the browser to satisfy better-auth's dynamic import.
// It stores a single value during the scoped run call and is noop otherwise.
if (typeof window !== "undefined" && !(globalThis as any).AsyncLocalStorage) {
  class AsyncLocalStoragePolyfill<T> {
    #store: T | undefined;
    disable() {
      this.#store = undefined;
    }
    getStore() {
      return this.#store;
    }
    run<R>(store: T, callback: (...args: any[]) => R, ...args: any[]): R {
      this.#store = store;
      try {
        return callback(...args);
      } finally {
        this.#store = undefined;
      }
    }
  }

  (globalThis as any).AsyncLocalStorage = AsyncLocalStoragePolyfill;
}
