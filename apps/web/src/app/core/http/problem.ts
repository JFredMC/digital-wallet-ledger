import { HttpErrorResponse } from '@angular/common/http';
import type { ProblemDetails } from '../api/api.models';
import { formatCop } from '../../shared/utils/money';

/** An error ready to show in the UI (Spanish), derived from RFC 9457 problem+json. */
export interface AppProblem {
  status: number;
  code: string;
  message: string;
  /** Network failures and 5xx: the same request (same Idempotency-Key) can be retried. */
  retryable: boolean;
  requestId?: string;
}

const MESSAGES: Record<string, string | ((p: ProblemDetails) => string)> = {
  NETWORK_ERROR: 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  VALIDATION_FAILED: 'Revisa los datos del formulario.',
  UNAUTHORIZED: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
  INVALID_REFRESH_TOKEN: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  REFRESH_TOKEN_REUSED: 'Por seguridad cerramos tu sesión. Vuelve a iniciar sesión.',
  EMAIL_ALREADY_REGISTERED: 'Ya existe una cuenta con ese correo.',
  ACCOUNT_NOT_FOUND: 'No encontramos la cuenta.',
  RECIPIENT_NOT_FOUND: 'No encontramos una cuenta activa con esos datos.',
  ACCOUNT_NOT_ACTIVE: 'La cuenta no está activa.',
  CURRENCY_MISMATCH: 'Las cuentas deben tener la misma moneda.',
  INSUFFICIENT_FUNDS: 'Saldo insuficiente para esta operación.',
  SAME_ACCOUNT_TRANSFER: 'No puedes transferirte a tu misma cuenta.',
  DEPOSITS_DISABLED: 'Los depósitos de prueba están deshabilitados.',
  DAILY_DEPOSIT_LIMIT_EXCEEDED: (p) =>
    `Superas el límite diario de depósitos. Puedes depositar hasta ${amount(p, 'remainingMinor')} más hoy.`,
  TRANSFER_LIMIT_EXCEEDED: (p) =>
    `El monto máximo por transferencia es ${amount(p, 'maxAmountMinor')}.`,
  DAILY_TRANSFER_LIMIT_EXCEEDED: (p) =>
    `Superas tu límite diario de transferencias. Puedes enviar hasta ${amount(p, 'remainingMinor')} más hoy.`,
  IDEMPOTENCY_KEY_REUSED: 'Esta operación ya se procesó con otros datos. Vuelve a intentarlo.',
  INVALID_CURSOR: 'No pudimos cargar más movimientos. Recarga la página.',
  INTERNAL_ERROR: 'Ocurrió un error inesperado. Inténtalo de nuevo en unos segundos.',
};

function amount(problem: ProblemDetails, field: string): string {
  const value = problem[field];
  return typeof value === 'number' ? formatCop(value) : 'el límite';
}

function isProblem(body: unknown): body is ProblemDetails {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as ProblemDetails).code === 'string' &&
    typeof (body as ProblemDetails).status === 'number'
  );
}

export function toProblem(error: unknown): AppProblem {
  if (!(error instanceof HttpErrorResponse)) {
    return {
      status: 0,
      code: 'UNKNOWN',
      message: MESSAGES['INTERNAL_ERROR'] as string,
      retryable: false,
    };
  }
  if (error.status === 0) {
    return {
      status: 0,
      code: 'NETWORK_ERROR',
      message: MESSAGES['NETWORK_ERROR'] as string,
      retryable: true,
    };
  }

  const body: unknown = error.error;
  const problem: ProblemDetails = isProblem(body)
    ? body
    : {
        type: 'about:blank',
        title: error.statusText,
        status: error.status,
        code: error.status >= 500 ? 'INTERNAL_ERROR' : `HTTP_${error.status}`,
        detail: '',
      };
  const known = MESSAGES[problem.code];
  const fallback =
    problem.status >= 500
      ? (MESSAGES['INTERNAL_ERROR'] as string)
      : 'No pudimos completar la operación. Inténtalo de nuevo.';

  return {
    status: problem.status,
    code: problem.code,
    message: typeof known === 'function' ? known(problem) : (known ?? fallback),
    retryable: problem.status >= 500 || problem.status === 429,
    requestId: problem.requestId,
  };
}
