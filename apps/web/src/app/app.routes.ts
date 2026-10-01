import type { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guards';
import { ShellComponent } from './core/layout/shell.component';

export const routes: Routes = [
  {
    path: 'ingresar',
    title: 'Ingresar · Billetera',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'registro',
    title: 'Crear cuenta · Billetera',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Inicio · Billetera',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'depositar',
        title: 'Depositar · Billetera',
        loadComponent: () => import('./features/deposits/deposit.page').then((m) => m.DepositPage),
      },
      {
        path: 'transferir',
        title: 'Transferir · Billetera',
        loadComponent: () =>
          import('./features/transfers/transfer.page').then((m) => m.TransferPage),
      },
      {
        path: 'movimientos',
        title: 'Movimientos · Billetera',
        loadComponent: () =>
          import('./features/transactions/history.page').then((m) => m.HistoryPage),
      },
    ],
  },
  {
    path: '**',
    title: 'No encontrada · Billetera',
    loadComponent: () => import('./features/not-found.page').then((m) => m.NotFoundPage),
  },
];
