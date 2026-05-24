import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RegisterPage } from './register';
import { AuthService } from '../../auth.service';

class MockAuthService {
  readonly session = signal<{ user: { email: string } } | null>(null);
  readonly initialized = signal(true);
  readonly isConfigured = computed(() => true);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isPasswordRecovery = signal(false);

  waitUntilInitialized = async (): Promise<void> => {};
  signUp = vi.fn().mockResolvedValue(null);
  signOut = async (): Promise<string | null> => null;
}

describe('RegisterPage', () => {
  let auth: MockAuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [{ provide: AuthService, useClass: MockAuthService }, provideRouter([])],
    }).compileComponents();

    auth = TestBed.inject(AuthService) as unknown as MockAuthService;
  });

  it('shows registration complete when already authenticated', async () => {
    auth.session.set({ user: { email: 'user@example.com' } });

    const fixture = TestBed.createComponent(RegisterPage);
    fixture.detectChanges();
    await fixture.whenStable();

    const page = fixture.componentInstance as unknown as { registrationComplete: () => boolean };
    expect(page.registrationComplete()).toBe(true);
  });

  it('calls signUp with email and password', async () => {
    const fixture = TestBed.createComponent(RegisterPage);
    const page = fixture.componentInstance as unknown as {
      registerForm: { setValue: (v: object) => void };
      register: () => Promise<void>;
      registrationComplete: () => boolean;
    };

    page.registerForm.setValue({ email: 'test@example.com', password: 'password123', confirmPassword: 'password123' });
    await page.register();

    expect(auth.signUp).toHaveBeenCalledWith('test@example.com', 'password123');
    expect(page.registrationComplete()).toBe(true);
  });

  it('shows error message on sign-up failure', async () => {
    auth.signUp.mockResolvedValue('Email already registered');

    const fixture = TestBed.createComponent(RegisterPage);
    const page = fixture.componentInstance as unknown as {
      registerForm: { setValue: (v: object) => void };
      register: () => Promise<void>;
      authMessage: () => string | null;
    };

    page.registerForm.setValue({ email: 'test@example.com', password: 'password123', confirmPassword: 'password123' });
    await page.register();

    expect(page.authMessage()).toBe('Email already registered');
  });
});
