import { computed, Injectable, signal } from '@angular/core';
import { Account, AppwriteException, Client, ID, Models, OAuthProvider } from 'appwrite';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private static readonly fallbackAppOrigin = 'https://clubshack.net';
  private static readonly notConfiguredMessage = 'Appwrite is not configured.';

  private readonly appwriteEndpoint = environment.appwriteEndpoint.trim();
  private readonly appwriteProjectId = environment.appwriteProjectId.trim();
  private resolveInitialized!: () => void;

  readonly isConfigured = computed(
    () => this.appwriteEndpoint.length > 0 && this.appwriteProjectId.length > 0,
  );
  readonly user = signal<Models.User<Models.Preferences> | null>(null);
  readonly initialized = signal(false);
  readonly isPasswordRecovery = signal(false);
  readonly isAuthenticated = computed(() => this.user() !== null);

  readonly client = this.isConfigured()
    ? new Client().setEndpoint(this.appwriteEndpoint).setProject(this.appwriteProjectId)
    : null;
  private readonly account: Account | null = this.client ? new Account(this.client) : null;
  private readonly initializedPromise = new Promise<void>((resolve) => {
    this.resolveInitialized = resolve;
  });

  constructor() {
    this.isPasswordRecovery.set(this.recoveryParams() !== null);

    if (!this.account) {
      this.markInitialized();
      return;
    }

    void this.refreshUser().finally(() => {
      this.markInitialized();
    });
  }

  async waitUntilInitialized(): Promise<void> {
    await this.initializedPromise;
  }

  async signInWithPassword(email: string, password: string): Promise<string | null> {
    if (!this.account) {
      return AuthService.notConfiguredMessage;
    }

    try {
      await this.account.createEmailPasswordSession({ email, password });
      await this.refreshUser();
      return null;
    } catch (error) {
      return AuthService.toMessage(error);
    }
  }

  async signInWithGoogle(redirectPath = '/'): Promise<string | null> {
    if (!this.account) {
      return AuthService.notConfiguredMessage;
    }

    try {
      // Redirects the browser to the provider, so this never returns on success.
      this.account.createOAuth2Session({
        provider: OAuthProvider.Google,
        success: this.buildRedirectUrl(redirectPath),
        failure: this.buildRedirectUrl('/login'),
      });
      return null;
    } catch (error) {
      return AuthService.toMessage(error);
    }
  }

  async signUp(email: string, password: string): Promise<string | null> {
    if (!this.account) {
      return AuthService.notConfiguredMessage;
    }

    try {
      await this.account.create({ userId: ID.unique(), email, password });
      await this.account.createEmailPasswordSession({ email, password });
      await this.refreshUser();
      return null;
    } catch (error) {
      return AuthService.toMessage(error);
    }
  }

  async signOut(): Promise<string | null> {
    if (!this.account) {
      return AuthService.notConfiguredMessage;
    }

    try {
      await this.account.deleteSession({ sessionId: 'current' });
      this.user.set(null);
      return null;
    } catch (error) {
      return AuthService.toMessage(error);
    }
  }

  async resetPasswordForEmail(email: string): Promise<string | null> {
    if (!this.account) {
      return AuthService.notConfiguredMessage;
    }

    try {
      await this.account.createRecovery({
        email,
        url: this.buildRedirectUrl('/reset-password'),
      });
      return null;
    } catch (error) {
      return AuthService.toMessage(error);
    }
  }

  /**
   * Sets a new password, either by completing an Appwrite recovery link (when the page
   * was opened with `userId` and `secret` query parameters) or, failing that, for the
   * currently signed-in user.
   */
  async updatePassword(newPassword: string): Promise<string | null> {
    if (!this.account) {
      return AuthService.notConfiguredMessage;
    }

    const recovery = this.recoveryParams();

    try {
      if (recovery) {
        await this.account.updateRecovery({
          ...recovery,
          password: newPassword,
        });
        this.isPasswordRecovery.set(false);
      } else {
        await this.account.updatePassword({ password: newPassword });
        await this.refreshUser();
      }
      return null;
    } catch (error) {
      return AuthService.toMessage(error);
    }
  }

  /** Mirrors profile fields onto the Appwrite account name and preferences. */
  async updateAccountProfile(
    displayName: string,
    prefs: Record<string, string | null>,
  ): Promise<string | null> {
    if (!this.account) {
      return AuthService.notConfiguredMessage;
    }

    try {
      await this.account.updateName({ name: displayName });
      await this.account.updatePrefs({ prefs });
      await this.refreshUser();
      return null;
    } catch (error) {
      return AuthService.toMessage(error);
    }
  }

  private async refreshUser(): Promise<void> {
    if (!this.account) {
      return;
    }

    try {
      this.user.set(await this.account.get());
    } catch {
      // No active session.
      this.user.set(null);
    }
  }

  private recoveryParams(): { userId: string; secret: string } | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const params = new URLSearchParams(window.location.search);
    const userId = params.get('userId');
    const secret = params.get('secret');
    return userId && secret ? { userId, secret } : null;
  }

  private markInitialized(): void {
    this.initialized.set(true);
    this.resolveInitialized();
  }

  private buildRedirectUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.resolveAppOrigin()}${normalizedPath}`;
  }

  private resolveAppOrigin(): string {
    if (typeof window === 'undefined') {
      return AuthService.fallbackAppOrigin;
    }

    const origin = window.location.origin?.trim();
    if (!origin) {
      return AuthService.fallbackAppOrigin;
    }

    try {
      const url = new URL(origin);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.origin;
      }
    } catch {
      return AuthService.fallbackAppOrigin;
    }

    return AuthService.fallbackAppOrigin;
  }

  private static toMessage(error: unknown): string {
    if (error instanceof AppwriteException) {
      return error.message;
    }
    return error instanceof Error ? error.message : 'Unexpected error.';
  }
}
