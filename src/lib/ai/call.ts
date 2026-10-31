/**
 * Bounded LLM calls: every call gets an AbortSignal and a hard deadline, so a client that ignores
 * the signal still cannot hold a request past its timeout. A caller's signal (the HTTP request
 * went away) aborts the call the same way.
 */

export class LlmTimeoutError extends Error {
  constructor(ms: number) {
    super(`LLM call timed out after ${ms} ms`);
    this.name = "LlmTimeoutError";
  }
}

/** The caller's signal aborted the call (e.g. the client disconnected). */
export class LlmAbortedError extends Error {
  constructor() {
    super("LLM call aborted by the caller");
    this.name = "LlmAbortedError";
  }
}

/**
 * Runs `call` with a signal that aborts after `ms` or when `outer` aborts, and rejects at that
 * moment even if the call ignores its signal.
 */
export async function withTimeout<T>(
  call: (signal: AbortSignal) => Promise<T>,
  ms: number,
  outer?: AbortSignal,
): Promise<T> {
  if (outer?.aborted) throw new LlmAbortedError();
  const controller = new AbortController();
  const signal = outer
    ? AbortSignal.any([controller.signal, outer])
    : controller.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => {
        controller.abort();
        reject(new LlmTimeoutError(ms));
      },
      Math.max(1, ms),
    );
    if (outer) {
      onAbort = () => reject(new LlmAbortedError());
      outer.addEventListener("abort", onAbort, { once: true });
    }
  });
  try {
    return await Promise.race([call(signal), deadline]);
  } finally {
    clearTimeout(timer);
    if (outer && onAbort) outer.removeEventListener("abort", onAbort);
  }
}

export function isTimeout(err: unknown): boolean {
  if (err instanceof LlmTimeoutError || err instanceof LlmAbortedError)
    return true;
  if (!(err instanceof Error)) return false;
  return (
    err.name === "TimeoutError" ||
    err.name === "AbortError" ||
    /\btimed? ?out\b|\bdeadline\b|\baborted\b/i.test(err.message)
  );
}

/** API keys (`AIza…`, `?key=…`) replaced by `[redacted]`. */
export function redactSecrets(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
    .replace(/([?&](?:key|api_key|apikey)=)[^&\s]+/gi, "$1[redacted]");
}

/** A short, secret-free description of an error for `fallback_reason` and logs. */
export function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return redactSecrets(message).replace(/\s+/g, " ").trim().slice(0, 160);
}
