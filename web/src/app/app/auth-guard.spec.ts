import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { authGuard } from './auth-guard';
import { AuthService } from '../auth.service';

class MockAuthService {
  readonly session = signal<{ user: { email: string } } | null>(null);
  readonly initialized = signal(true);
  readonly isConfigured = computed(() => true);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.user() !== null);

  waitUntilInitialized = async (): Promise<void> => {};
}

describe('authGuard', () => {
  let auth: MockAuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useClass: MockAuthService }],
    });

    auth = TestBed.inject(AuthService) as unknown as MockAuthService;
    router = TestBed.inject(Router);
  });

  it('allows authenticated users through', async () => {
    auth.session.set({ user: { email: 'user@example.com' } });

    const result = await TestBed.runInInjectionContext(() => authGuard({} as never, { url: '/' } as never));

    expect(result).toBe(true);
  });

  it('redirects unauthenticated users to login with a return url', async () => {
    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/reservations' } as never),
    );

    expect(router.serializeUrl(result as ReturnType<Router['createUrlTree']>)).toBe(
      '/login?redirectTo=%2Freservations',
    );
  });
});
