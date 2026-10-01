/** ISO 4217 currencies supported by the wallet. COP uses 2 minor-unit digits. */
export const SUPPORTED_CURRENCIES = ['COP'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = 'COP';
