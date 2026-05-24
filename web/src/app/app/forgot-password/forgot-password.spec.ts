import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ForgotPasswordPage } from './forgot-password';
import { AuthService } from '../../auth.service';

class MockAuthService {
  readonly session = signal<null>(null);
  readonly initialized = signal(true);
  readonly isConfigured = computed(() => true);
  readonly user = computed(() => null);
  readonly isAuthenticated = computed(() => false);
  readonly isPasswordRecovery = signal(false);

  resetPasswordForEmail = vi.fn().mockResolvedValue(null);
}

describe('ForgotPasswordPage', () => {
  let auth: MockAuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForgotPasswordPage],
      providers: [{ provide: AuthService, useClass: MockAuthService }, provideRouter([])],
    }).compileComponents();

    auth = TestBed.inject(AuthService) as unknown as MockAuthService;
  });

  it('calls resetPasswordForEmail and shows success', async () => {
    const fixture = TestBed.createComponent(ForgotPasswordPage);
    const page = fixture.componentInstance as unknown as {
      forgotForm: { setValue: (v: object) => void };
      sendResetEmail: () => Promise<void>;
      emailSent: () => boolean;
    };

    page.forgotForm.setValue({ email: 'user@example.com' });
    await page.sendResetEmail();

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('user@example.com');
    expect(page.emailSent()).toBe(true);
  });

  it('shows error message on failure', async () => {
    auth.resetPasswordForEmail.mockResolvedValue('Rate limit exceeded');

    const fixture = TestBed.createComponent(ForgotPasswordPage);
    const page = fixture.componentInstance as unknown as {
      forgotForm: { setValue: (v: object) => void };
      sendResetEmail: () => Promise<void>;
      authMessage: () => string | null;
      emailSent: () => boolean;
    };

    page.forgotForm.setValue({ email: 'user@example.com' });
    await page.sendResetEmail();

    expect(page.emailSent()).toBe(false);
    expect(page.authMessage()).toBe('Rate limit exceeded');
  });
});
