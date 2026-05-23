import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  imports: [
    ReactiveFormsModule,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly title = signal('Station Reservation');
  protected readonly sidenavOpen = signal(true);
  protected readonly authMessage = signal<string | null>(null);
  protected readonly isSubmitting = signal(false);
  protected readonly signInForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

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

  protected async signOut(): Promise<void> {
    const errorMessage = await this.auth.signOut();
    this.authMessage.set(errorMessage ?? null);
  }
}
