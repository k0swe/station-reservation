import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  protected readonly auth = inject(AuthService);
  protected readonly authMessage = signal<string | null>(null);
  protected readonly isSubmitting = signal(false);
  protected readonly signInForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly redirectTo = this.route.snapshot.queryParamMap.get('redirectTo') ?? '/';

  constructor() {
    effect(() => {
      if (this.auth.initialized() && this.auth.isAuthenticated()) {
        void this.router.navigateByUrl(this.redirectTo, { replaceUrl: true });
      }
    });
  }

  protected async signIn(): Promise<void> {
    if (this.signInForm.invalid) {
      this.signInForm.markAllAsTouched();
      return;
    }

    this.authMessage.set(null);
    this.isSubmitting.set(true);

    const { email, password } = this.signInForm.getRawValue();
    const errorMessage = await this.auth.signInWithPassword(email, password);
    if (errorMessage) {
      this.authMessage.set(errorMessage);
    }

    this.isSubmitting.set(false);
  }
}
