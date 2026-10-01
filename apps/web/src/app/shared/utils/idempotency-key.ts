/**
 * One Idempotency-Key per user intent: the same key is reused while the user
 * retries the same payload (lost response, network error, 5xx), and a new key
 * is created when the payload changes or after a success.
 */
export class IdempotencyKeyTracker {
  private key: string | null = null;
  private fingerprint: string | null = null;

  constructor(private readonly generate: () => string = () => crypto.randomUUID()) {}

  keyFor(payload: unknown): string {
    const fingerprint = JSON.stringify(payload);
    if (this.key === null || fingerprint !== this.fingerprint) {
      this.key = this.generate();
      this.fingerprint = fingerprint;
    }
    return this.key;
  }

  /** Call after a successful operation: the next submit is a new intent. */
  reset(): void {
    this.key = null;
    this.fingerprint = null;
  }
}
