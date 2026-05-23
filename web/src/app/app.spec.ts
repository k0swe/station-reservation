import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { AuthService } from './auth.service';

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

describe('App', () => {
  let auth: MockAuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), { provide: AuthService, useClass: MockAuthService }],
    }).compileComponents();

    auth = TestBed.inject(AuthService) as unknown as MockAuthService;
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title in toolbar', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('mat-toolbar')?.textContent).toContain('Club Shack');
  });

  it('should show a login link in the toolbar and not in the sidenav when signed out', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('mat-toolbar a[href="/login"]')?.textContent).toContain('Login');
    expect(compiled.querySelector('mat-nav-list')?.textContent).not.toContain('Login');
  });

  it('should show the user email in the toolbar when signed in', async () => {
    auth.session.set({ user: { email: 'user@example.com' } });

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.user-email')?.textContent).toContain('user@example.com');
    expect(compiled.querySelector('mat-toolbar a[href="/login"]')).toBeNull();
  });
});
