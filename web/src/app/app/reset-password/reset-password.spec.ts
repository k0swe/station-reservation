import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ResetPasswordPage } from './reset-password';
import { AuthService } from '../../auth.service';

class MockAuthService {
  readonly session = signal<{ user: { email: string } } | null>(null);
  readonly initialized = signal(true);
  readonly isConfigured = computed(() => true);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isPasswordRecovery = signal(true);

  updatePassword = vi.fn().mockResolvedValue(null);
}

describe('ResetPasswordPage', () => {
  let auth: MockAuthService;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResetPasswordPage],
      providers: [{ provide: AuthService, useClass: MockAuthService }, provideRouter([])],
    }).compileComponents();

    auth = TestBed.inject(AuthService) as unknown as MockAuthService;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  it('redirects to login when not in recovery mode and not authenticated', async () => {
    auth.isPasswordRecovery.set(false);

    const fixture = TestBed.createComponent(ResetPasswordPage);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('calls updatePassword and sets passwordUpdated on success', async () => {
    const fixture = TestBed.createComponent(ResetPasswordPage);
    const page = fixture.componentInstance as unknown as {
      resetForm: { setValue: (v: object) => void };
      updatePassword: () => Promise<void>;
      passwordUpdated: () => boolean;
    };

    page.resetForm.setValue({ password: 'newpassword123', confirmPassword: 'newpassword123' });
    await page.updatePassword();

    expect(auth.updatePassword).toHaveBeenCalledWith('newpassword123');
    expect(page.passwordUpdated()).toBe(true);
  });

  it('shows error message on failure', async () => {
    auth.updatePassword.mockResolvedValue('Token expired');

    const fixture = TestBed.createComponent(ResetPasswordPage);
    const page = fixture.componentInstance as unknown as {
      resetForm: { setValue: (v: object) => void };
      updatePassword: () => Promise<void>;
      authMessage: () => string | null;
    };

    page.resetForm.setValue({ password: 'newpassword123', confirmPassword: 'newpassword123' });
    await page.updatePassword();

    expect(page.authMessage()).toBe('Token expired');
  });
});
