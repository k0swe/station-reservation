import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../auth.service';

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value as string;
  const confirmPassword = group.get('confirmPassword')?.value as string;
  return password === confirmPassword ? null : { passwordsMismatch: true };
}

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule, RouterLink],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordPage {
  protected readonly auth = inject(AuthService);
  protected readonly authMessage = signal<string | null>(null);
  protected readonly isSubmitting = signal(false);
  protected readonly passwordUpdated = signal(false);
  protected readonly resetForm = new FormGroup(
    {
      password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
      confirmPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: passwordsMatchValidator },
  );

  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      // If the user navigated here without a recovery session and isn't in a recovery flow,
      // redirect to login once auth is initialized.
      if (this.auth.initialized() && !this.auth.isAuthenticated() && !this.auth.isPasswordRecovery()) {
        void this.router.navigate(['/login']);
      }
    });
  }

  protected async updatePassword(): Promise<void> {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.authMessage.set(null);
    this.isSubmitting.set(true);

    const { password } = this.resetForm.getRawValue();
    const errorMessage = await this.auth.updatePassword(password);
    if (errorMessage) {
      this.authMessage.set(errorMessage);
    } else {
      this.passwordUpdated.set(true);
    }

    this.isSubmitting.set(false);
  }
}
