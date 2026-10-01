/**
 * Runs `task` while holding a browser-wide lock (Web Locks API), so tabs of
 * the same origin never refresh concurrently. The refresh token is single-use
 * with reuse detection: two tabs presenting the same cookie at once would
 * revoke the session. Serialized, the second tab sends the already-rotated
 * cookie and simply rotates it again.
 */
export function withCrossTabLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request(name, task) : task();
}
