import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { parseCopInput } from './money';

/** Amount typed in pesos ("25.000,50"); optional upper bound in minor units. */
export function copAmountValidator(maxMinor?: () => number | null): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const raw = control.value?.trim() ?? '';
    if (raw === '') return null; // `required` reports empty values
    const minor = parseCopInput(raw);
    if (minor === null) return { copAmount: true };
    if (minor < 1) return { copMin: true };
    const max = maxMinor?.();
    if (max !== null && max !== undefined && minor > max) return { copMax: { max } };
    return null;
  };
}

/** Only same-app relative URLs, to avoid open redirects via ?returnUrl=. */
export function safeReturnUrl(url: string | null | undefined, fallback = '/inicio'): string {
  return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\')
    ? url
    : fallback;
}
