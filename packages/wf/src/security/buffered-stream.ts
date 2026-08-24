/**
 * Creates a one-consumer async stream whose subscription starts as soon as
 * the iterator is requested. Values published while authorization is being
 * completed are buffered, so a slow token verification cannot create a lost
 * event window.
 */
export function createBufferedAsyncStream<T>(
  initialize: (push: (value: T) => void) => Promise<() => void>,
  maxBufferedValues = 1000,
  signal?: AbortSignal,
): AsyncIterable<T> {
  if (maxBufferedValues < 1)
    throw new RangeError("maxBufferedValues must be positive");
  const buffered: T[] = [];
  let started = false;
  let closed = false;
  let failure: unknown;
  let unsubscribe: (() => void) | undefined;
  let ready: Promise<void> | undefined;
  let waiter:
    | {
        resolve: (result: IteratorResult<T>) => void;
        reject: (error: unknown) => void;
      }
    | undefined;

  const finish = (): void => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    unsubscribe = undefined;
    signal?.removeEventListener("abort", finish);
    waiter?.resolve({ done: true, value: undefined });
    waiter = undefined;
  };

  const fail = (error: unknown): void => {
    failure = error;
    closed = true;
    unsubscribe?.();
    unsubscribe = undefined;
    signal?.removeEventListener("abort", finish);
    waiter?.reject(error);
    waiter = undefined;
  };

  const push = (value: T): void => {
    if (closed) return;
    if (waiter) {
      const pending = waiter;
      waiter = undefined;
      pending.resolve({ done: false, value });
      return;
    }
    if (buffered.length >= maxBufferedValues) buffered.shift();
    buffered.push(value);
  };

  const start = (): void => {
    if (started) return;
    started = true;
    if (signal?.aborted) {
      finish();
      ready = Promise.resolve();
      return;
    }
    signal?.addEventListener("abort", finish, { once: true });
    ready = initialize(push).then(
      (cleanup) => {
        if (closed) cleanup();
        else unsubscribe = cleanup;
      },
      (error) => {
        fail(error);
      },
    );
  };

  const iterator: AsyncIterator<T> = {
    next: async (): Promise<IteratorResult<T>> => {
      start();
      await ready;
      if (failure !== undefined) throw failure;
      if (closed) return { done: true, value: undefined };
      if (buffered.length > 0) {
        const value = buffered.shift()!;
        return { done: false, value };
      }
      return new Promise<IteratorResult<T>>((resolve, reject) => {
        waiter = { resolve, reject };
      });
    },
    return: async (): Promise<IteratorResult<T>> => {
      finish();
      return { done: true, value: undefined };
    },
  };

  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      start();
      return iterator;
    },
  };
}
