// per-key-mutex.js — process-memory mutex factory keyed by an arbitrary string.
//
// Use case: serialise mutating operations against a single resource (a skill
// source, a handoff slug, a registry file) without taking a global lock. Each
// factory instance owns its own key→promise map so unrelated keys never block
// each other.
//
// Process-memory only by design — no lock files, no fsync, no recovery from
// stale locks. Server restart drops everything; partially-completed operations
// are recoverable by inspecting on-disk state.

// @ts-check

/**
 * Create an isolated mutex factory. Returns a function `withKeyMutex(key, fn)`
 * that runs `fn` while any prior in-flight `fn` against the same key has
 * resolved (success or failure — we don't propagate prior errors).
 *
 * @returns {<T>(key: string, fn: () => Promise<T>) => Promise<T>}
 */
function createKeyMutex() {
  /** @type {Map<string, Promise<unknown>>} */
  const inFlight = new Map();
  return async function withKeyMutex(key, fn) {
    const prior = inFlight.get(key);
    if (prior) {
      try {
        await prior;
      } catch {
        /* ignore — predecessor error is theirs to report */
      }
    }
    const promise = (async () => fn())();
    inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    }
  };
}

module.exports = { createKeyMutex };
