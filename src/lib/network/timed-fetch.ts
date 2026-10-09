/** Bound GraphQL fetches so a stalled Supabase call cannot hold a function open. */
export const GRAPHQL_TIMEOUT_MS = 6_000;

type FetchFn = typeof fetch;

/** Resolve `fetch` per call so Next.js' patched fetch (Data Cache) still applies. */
const lateBoundFetch: FetchFn = (input, init) => globalThis.fetch(input, init);

/**
 * Combines the caller's AbortSignal (URQL cancel) with a hard timeout.
 * Always clears the timer and removes listeners so nothing leaks after abort.
 */
export function createTimedFetch(
  timeoutMs: number = GRAPHQL_TIMEOUT_MS,
  baseFetch: FetchFn = lateBoundFetch,
): FetchFn {
  return async (input, init) => {
    const requestInit: RequestInit = init ?? {};
    const controller = new AbortController();
    const external = requestInit.signal;
    const onExternalAbort = () => {
      try {
        controller.abort(external?.reason);
      } catch {
        controller.abort();
      }
    };

    if (external) {
      if (external.aborted) {
        onExternalAbort();
      } else {
        external.addEventListener("abort", onExternalAbort, { once: true });
      }
    }

    const timer = setTimeout(() => {
      try {
        controller.abort(new Error(`GraphQL timed out after ${timeoutMs}ms`));
      } catch {
        controller.abort();
      }
    }, timeoutMs);

    try {
      return await baseFetch(input, {
        ...requestInit,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    }
  };
}
