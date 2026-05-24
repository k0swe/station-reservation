import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
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
  const themeStorageKey = 'club-shack-theme-preference';

  beforeEach(async () => {
    localStorage.removeItem(themeStorageKey);
    document.documentElement.removeAttribute('data-theme');

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), { provide: AuthService, useClass: MockAuthService }],
    }).compileComponents();

    auth = TestBed.inject(AuthService) as unknown as MockAuthService;
  });

  afterEach(() => {
    localStorage.removeItem(themeStorageKey);
    document.documentElement.removeAttribute('data-theme');
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

  it('should render tri-state theme controls', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const toggleButtons = compiled.querySelectorAll('mat-button-toggle');
    expect(toggleButtons).toHaveLength(3);
  });

  it('keeps the home route public without an auth guard', () => {
    const homeRoute = routes.find((route) => route.path === '');
    expect(homeRoute?.canActivate).toBeUndefined();
  });

  it('should show a login avatar button in the toolbar and not in the sidenav when signed out', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('mat-toolbar button[aria-label="Login"]')).not.toBeNull();
    expect(compiled.querySelector('mat-nav-list')?.textContent).not.toContain('Login');
  });

  it('should show an account menu trigger in the toolbar when signed in', async () => {
    auth.session.set({ user: { email: 'user@example.com' } });

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('mat-toolbar button[aria-label="Open account menu"]')).not.toBeNull();
    expect(compiled.querySelector('mat-toolbar button[aria-label="Login"]')).toBeNull();
  });

  it('should navigate to login after successful sign out', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as { signOut: () => Promise<void> };
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await app.signOut();

    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });

  it('should set html data-theme for explicit light/dark and clear it for system', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as { setThemePreference: (value: string) => void };
    await fixture.whenStable();

    app.setThemePreference('dark');
    fixture.detectChanges();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    app.setThemePreference('light');
    fixture.detectChanges();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    app.setThemePreference('system');
    fixture.detectChanges();
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });
});
