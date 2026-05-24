import { BreakpointObserver } from '@angular/cdk/layout';
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

type ThemePreference = 'light' | 'system' | 'dark';

const THEME_STORAGE_KEY = 'club-shack-theme-preference';
const MOBILE_NAV_MEDIA_QUERY = '(max-width: 767px)';

@Component({
  selector: 'app-root',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatButtonModule,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatMenuModule,
    MatButtonToggleModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly title = signal('Club Shack');
  protected readonly sidenavOpen = signal(true);
  private readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly isNarrowScreen = toSignal(
    this.breakpointObserver
      .observe(MOBILE_NAV_MEDIA_QUERY)
      .pipe(map((state) => state.matches)),
    { initialValue: this.breakpointObserver.isMatched(MOBILE_NAV_MEDIA_QUERY) },
  );
  protected readonly themePreference = signal<ThemePreference>(this.getInitialThemePreference());
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly document = inject(DOCUMENT);

  constructor() {
    effect(() => {
      const preference = this.themePreference();
      this.applyThemePreference(preference);
      this.persistThemePreference(preference);
    });

    effect(() => {
      this.sidenavOpen.set(!this.isNarrowScreen());
    });
  }

  protected async signOut(): Promise<void> {
    const errorMessage = await this.auth.signOut();
    if (errorMessage) {
      return;
    }

    await this.router.navigate(['/login']);
  }

  protected setThemePreference(value: string): void {
    if (!this.isThemePreference(value)) {
      return;
    }

    this.themePreference.set(value);
  }

  private getInitialThemePreference(): ThemePreference {
    try {
      const storedPreference = localStorage.getItem(THEME_STORAGE_KEY);
      if (this.isThemePreference(storedPreference)) {
        return storedPreference;
      }
    } catch {
      // Ignore storage access errors and fall back to system.
    }

    return 'system';
  }

  private persistThemePreference(preference: ThemePreference): void {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Ignore storage access errors.
    }
  }

  private applyThemePreference(preference: ThemePreference): void {
    const rootElement = this.document.documentElement;
    if (preference === 'system') {
      rootElement.removeAttribute('data-theme');
      return;
    }

    rootElement.setAttribute('data-theme', preference);
  }

  private isThemePreference(value: string | null): value is ThemePreference {
    return value === 'light' || value === 'system' || value === 'dark';
  }
}
