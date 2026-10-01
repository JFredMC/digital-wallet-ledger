import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Private pages: restore the session from the cookie if needed, else go to login. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (await auth.restoreSession()) return true;
  return router.createUrlTree(['/ingresar'], { queryParams: { returnUrl: state.url } });
};

/** Login/register: an already signed-in user goes straight to the dashboard. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return (await auth.restoreSession()) ? router.createUrlTree(['/inicio']) : true;
};
