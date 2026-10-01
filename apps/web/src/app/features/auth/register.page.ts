import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { type AppProblem, toProblem } from '../../core/http/problem';
import { DemoBannerComponent } from '../../shared/ui/demo-banner.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProblemAlertComponent } from '../../shared/ui/problem-alert.component';

/** Mirrors the API rule: 8+ characters with at least one letter and one number. */
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

@Component({
  selector: 'app-register-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ProblemAlertComponent,
    IconComponent,
    DemoBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register.page.html',
  styleUrl: './auth-page.scss',
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group({
    fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN)]],
  });
  protected readonly submitting = signal(false);
  protected readonly problem = signal<AppProblem | null>(null);

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.problem.set(null);
    const { fullName, email, password } = this.form.getRawValue();
    this.auth.register({ fullName: fullName.trim(), email: email.trim(), password }).subscribe({
      next: () => void this.router.navigateByUrl('/inicio'),
      error: (error: unknown) => {
        this.problem.set(toProblem(error));
        this.submitting.set(false);
      },
    });
  }
}
