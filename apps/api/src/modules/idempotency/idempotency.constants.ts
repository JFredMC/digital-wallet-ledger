export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
/** Set on responses that were replayed from a stored result instead of executed. */
export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed';
/** 8–255 URL-safe characters; a UUID v4 is the recommended value. */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,255}$/;
