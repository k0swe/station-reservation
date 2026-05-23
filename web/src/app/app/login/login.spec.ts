import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { LoginPage } from './login';
import { AuthService } from '../../auth.service';

class MockAuthService {
  readonly session = signal<{ user: { email: string } } | null>(null);
  readonly initialized = signal(true);
  readonly isConfigured = computed(() => true);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.user() !== null);

  waitUntilInitialized = async (): Promise<void> => {};
  signInWithPassword = async (): Promise<string | null> => null;
  signOut = async (): Promise<string | null> => null;
}

describe('LoginPage', () => {
  let auth: MockAuthService;
  let router: Pick<Router, 'navigateByUrl'>;
  let redirectTo: string | null;

  beforeEach(async () => {
    redirectTo = null;
    router = {
      navigateByUrl: vi.fn().mockResolvedValue(true),
    };

    const route: Pick<ActivatedRoute, 'snapshot'> = {
      get snapshot() {
        return {
          queryParamMap: convertToParamMap(redirectTo ? { redirectTo } : {}),
        } as ActivatedRoute['snapshot'];
      },
    };

    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        { provide: AuthService, useClass: MockAuthService },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: route },
      ],
    }).compileComponents();

    auth = TestBed.inject(AuthService) as unknown as MockAuthService;
  });

  it('uses the latest redirectTo query param after signing in', async () => {
    TestBed.createComponent(LoginPage);
    redirectTo = '/clubs';
    auth.session.set({ user: { email: 'user@example.com' } });

    await Promise.resolve();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/clubs', { replaceUrl: true });
  });
});
