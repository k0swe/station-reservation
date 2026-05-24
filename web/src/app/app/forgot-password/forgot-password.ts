import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth.service';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordPage {
  protected readonly auth = inject(AuthService);
  protected readonly authMessage = signal<string | null>(null);
  protected readonly isSubmitting = signal(false);
  protected readonly emailSent = signal(false);
  protected readonly forgotForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
  });

  protected async sendResetEmail(): Promise<void> {
    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }

    this.authMessage.set(null);
    this.isSubmitting.set(true);

    const { email } = this.forgotForm.getRawValue();
    const errorMessage = await this.auth.resetPasswordForEmail(email);
    if (errorMessage) {
      this.authMessage.set(errorMessage);
    } else {
      this.emailSent.set(true);
    }

    this.isSubmitting.set(false);
  }
}
