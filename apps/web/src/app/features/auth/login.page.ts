import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { DEMO_MODE, type DemoCredential } from '../../core/demo/demo-mode';
import { type AppProblem, toProblem } from '../../core/http/problem';
import { DemoBannerComponent } from '../../shared/ui/demo-banner.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProblemAlertComponent } from '../../shared/ui/problem-alert.component';
import { safeReturnUrl } from '../../shared/utils/validators';

@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ProblemAlertComponent,
    IconComponent,
    DemoBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.page.html',
  styleUrl: './auth-page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Bound from the query string (withComponentInputBinding). */
  readonly returnUrl = input<string>();
  readonly sesion = input<string>();
  /** `?demo=restablecida` after "Restablecer demo". */
  readonly demo = input<string>();

  /** Demo build only: sample accounts to log in with. */
  protected readonly demoMode = inject(DEMO_MODE);
  protected readonly demoReset = computed(() => this.demo() === 'restablecida');

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  protected readonly submitting = signal(false);
  protected readonly problem = signal<AppProblem | null>(null);

  protected useDemo(account: DemoCredential): void {
    this.form.setValue({ email: account.email, password: account.password });
    this.problem.set(null);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.problem.set(null);
    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => void this.router.navigateByUrl(safeReturnUrl(this.returnUrl())),
      error: (error: unknown) => {
        this.problem.set(toProblem(error));
        this.submitting.set(false);
      },
    });
  }
}
