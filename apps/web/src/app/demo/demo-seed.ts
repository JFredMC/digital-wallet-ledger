import type { DemoCredential } from '../core/demo/demo-mode';
import {
  createUser,
  DAY_MS,
  type DemoAccount,
  type DemoDb,
  emptyDb,
  postDeposit,
  postTransfer,
} from './demo-db';

export const DEMO_PASSWORD = 'Demo1234';

/** Sample users (all with the same password), shown on the login screen. */
export const DEMO_CREDENTIALS: readonly DemoCredential[] = [
  { fullName: 'Ana María Gómez', email: 'ana@billetera.demo', password: DEMO_PASSWORD },
  { fullName: 'Luis Alberto Pérez', email: 'luis@billetera.demo', password: DEMO_PASSWORD },
  { fullName: 'Valentina Rojas', email: 'valentina@billetera.demo', password: DEMO_PASSWORD },
];

const ALIASES = ['ana', 'luis', 'vale'];
const HOUR_MS = 60 * 60 * 1000;
const pesos = (value: number) => value * 100;

type Who = 'ana' | 'luis' | 'vale';
type SeedOp =
  | { hoursAgo: number; deposit: Who; pesos: number }
  | { hoursAgo: number; from: Who; to: Who; pesos: number; description: string };

/**
 * Two weeks of activity, all older than 24 h so the daily limits start fresh.
 * Every deposit respects the daily limit. Ana ends with 13 movements and
 * $ 1.385.000 (more than one page of history).
 */
const OPS: SeedOp[] = [
  { hoursAgo: 13 * 24 + 9, deposit: 'ana', pesos: 900_000 },
  { hoursAgo: 13 * 24 + 8, deposit: 'luis', pesos: 800_000 },
  { hoursAgo: 13 * 24 + 7, deposit: 'vale', pesos: 650_000 },
  {
    hoursAgo: 12 * 24 + 4,
    from: 'ana',
    to: 'luis',
    pesos: 85_000,
    description: 'Arriendo compartido',
  },
  { hoursAgo: 11 * 24 + 2, from: 'vale', to: 'ana', pesos: 120_000, description: 'Mercado' },
  { hoursAgo: 11 * 24 + 1, deposit: 'ana', pesos: 300_000 },
  {
    hoursAgo: 10 * 24 + 5,
    from: 'luis',
    to: 'ana',
    pesos: 42_500,
    description: 'Almuerzo del viernes',
  },
  { hoursAgo: 9 * 24 + 10, from: 'ana', to: 'vale', pesos: 35_000, description: 'Taxi aeropuerto' },
  { hoursAgo: 8 * 24 + 3, deposit: 'ana', pesos: 300_000 },
  {
    hoursAgo: 7 * 24 + 1,
    from: 'ana',
    to: 'luis',
    pesos: 60_000,
    description: 'Cumpleaños de mamá',
  },
  { hoursAgo: 6 * 24 + 9, from: 'luis', to: 'vale', pesos: 25_000, description: 'Café' },
  { hoursAgo: 5 * 24 + 6, from: 'vale', to: 'ana', pesos: 18_000, description: 'Pizza' },
  { hoursAgo: 4 * 24 + 2, from: 'ana', to: 'vale', pesos: 150_000, description: 'Concierto' },
  {
    hoursAgo: 3 * 24 + 11,
    from: 'luis',
    to: 'ana',
    pesos: 95_000,
    description: 'Gasolina del viaje',
  },
  { hoursAgo: 2 * 24 + 5, from: 'ana', to: 'luis', pesos: 12_500, description: 'Parqueadero' },
  { hoursAgo: 2 * 24 + 1, deposit: 'vale', pesos: 200_000 },
  { hoursAgo: 36, from: 'ana', to: 'vale', pesos: 48_000, description: 'Domicilio' },
];

/** Builds the sample database through the same posting rules as live requests. */
export async function createSeedDb(now: number): Promise<DemoDb> {
  const db = emptyDb();
  const start = now - 14 * DAY_MS;
  const wallets = {} as Record<Who, DemoAccount>;
  for (const [i, credential] of DEMO_CREDENTIALS.entries()) {
    const { account } = await createUser(db, { ...credential, alias: ALIASES[i] }, start);
    wallets[ALIASES[i] as Who] = account;
  }
  for (const op of OPS) {
    const at = now - op.hoursAgo * HOUR_MS;
    if ('deposit' in op) {
      postDeposit(db, wallets[op.deposit], pesos(op.pesos), 'Demo top-up', at);
    } else {
      postTransfer(db, wallets[op.from], wallets[op.to], pesos(op.pesos), op.description, at);
    }
  }
  return db;
}
