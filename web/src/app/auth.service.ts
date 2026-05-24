import { computed, Injectable, signal } from '@angular/core';
import type { GoTrueClient, Session } from '@supabase/auth-js';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabaseUrl = environment.supabaseUrl.trim();
  private readonly supabasePublishableKey = environment.supabasePublishableKey.trim();
  private resolveInitialized!: () => void;

  readonly isConfigured = computed(() => this.supabaseUrl.length > 0 && this.supabasePublishableKey.length > 0);
  readonly session = signal<Session | null>(null);
  readonly initialized = signal(false);
  readonly isPasswordRecovery = signal(false);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.user() !== null);

  readonly supabase = this.isConfigured() ? createClient(this.supabaseUrl, this.supabasePublishableKey) : null;
  private readonly authClient: GoTrueClient | null = this.supabase ? (this.supabase.auth as GoTrueClient) : null;
  private readonly initializedPromise = new Promise<void>((resolve) => {
    this.resolveInitialized = resolve;
  });

  constructor() {
    if (!this.authClient) {
      this.markInitialized();
      return;
    }

    void this.authClient
      .getSession()
      .then(({ data }) => {
        this.session.set(data.session);
      })
      .finally(() => {
        this.markInitialized();
      });

    this.authClient.onAuthStateChange((event, session) => {
      this.session.set(session);
      if (event === 'PASSWORD_RECOVERY') {
        this.isPasswordRecovery.set(true);
      }
    });
  }

  async waitUntilInitialized(): Promise<void> {
    await this.initializedPromise;
  }

  async signInWithPassword(email: string, password: string): Promise<string | null> {
    if (!this.authClient) {
      return 'Supabase is not configured.';
    }

    const { error } = await this.authClient.signInWithPassword({ email, password });
    return error?.message ?? null;
  }

  async signUp(email: string, password: string): Promise<string | null> {
    if (!this.authClient) {
      return 'Supabase is not configured.';
    }

    const { error } = await this.authClient.signUp({ email, password });
    return error?.message ?? null;
  }

  async signOut(): Promise<string | null> {
    if (!this.authClient) {
      return 'Supabase is not configured.';
    }

    const { error } = await this.authClient.signOut();
    return error?.message ?? null;
  }

  async resetPasswordForEmail(email: string, redirectTo: string): Promise<string | null> {
    if (!this.authClient) {
      return 'Supabase is not configured.';
    }

    const { error } = await this.authClient.resetPasswordForEmail(email, { redirectTo });
    return error?.message ?? null;
  }

  async updatePassword(newPassword: string): Promise<string | null> {
    if (!this.authClient) {
      return 'Supabase is not configured.';
    }

    const { error } = await this.authClient.updateUser({ password: newPassword });
    return error?.message ?? null;
  }

  async updateUserMetadata(metadata: Record<string, string | null>): Promise<string | null> {
    if (!this.authClient) {
      return 'Supabase is not configured.';
    }

    const { error } = await this.authClient.updateUser({ data: metadata });
    return error?.message ?? null;
  }

  private markInitialized(): void {
    this.initialized.set(true);
    this.resolveInitialized();
  }
}
