import { computed, Injectable, signal } from '@angular/core';
import type { GoTrueClient, Session } from '@supabase/auth-js';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabaseUrl = environment.supabaseUrl.trim();
  private readonly supabaseAnonKey = environment.supabaseAnonKey.trim();

  readonly isConfigured = computed(() => this.supabaseUrl.length > 0 && this.supabaseAnonKey.length > 0);
  readonly session = signal<Session | null>(null);
  readonly initialized = signal(false);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.user() !== null);

  private readonly client = this.isConfigured() ? createClient(this.supabaseUrl, this.supabaseAnonKey) : null;
  private readonly authClient: GoTrueClient | null = this.client ? (this.client.auth as GoTrueClient) : null;

  constructor() {
    if (!this.authClient) {
      this.initialized.set(true);
      return;
    }

    void this.authClient
      .getSession()
      .then(({ data }) => {
        this.session.set(data.session);
      })
      .finally(() => {
        this.initialized.set(true);
      });

    this.authClient.onAuthStateChange((_, session) => {
      this.session.set(session);
    });
  }

  async signInWithPassword(email: string, password: string): Promise<string | null> {
    if (!this.authClient) {
      return 'Supabase is not configured.';
    }

    const { error } = await this.authClient.signInWithPassword({ email, password });
    return error?.message ?? null;
  }

  async signOut(): Promise<string | null> {
    if (!this.authClient) {
      return 'Supabase is not configured.';
    }

    const { error } = await this.authClient.signOut();
    return error?.message ?? null;
  }
}
