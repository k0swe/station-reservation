import { computed, Injectable, signal } from '@angular/core';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
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

  private readonly client: SupabaseClient | null = this.isConfigured()
    ? createClient(this.supabaseUrl, this.supabaseAnonKey)
    : null;

  constructor() {
    if (!this.client) {
      this.initialized.set(true);
      return;
    }

    void this.client.auth
      .getSession()
      .then(({ data }) => {
        this.session.set(data.session);
      })
      .finally(() => {
        this.initialized.set(true);
      });

    this.client.auth.onAuthStateChange((_, session) => {
      this.session.set(session);
    });
  }

  async signInWithPassword(email: string, password: string): Promise<string | null> {
    if (!this.client) {
      return 'Supabase is not configured.';
    }

    const { error } = await this.client.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }

  async signOut(): Promise<string | null> {
    if (!this.client) {
      return 'Supabase is not configured.';
    }

    const { error } = await this.client.auth.signOut();
    return error?.message ?? null;
  }
}
