import { inject, Injectable } from '@angular/core';
import { AuthService } from './auth.service';

export interface Club {
  id: string;
  name: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ClubService {
  private readonly auth = inject(AuthService);

  private get supabase() {
    return this.auth.supabase;
  }

  async listClubs(): Promise<{ data: Club[] | null; error: string | null }> {
    if (!this.supabase) {
      return { data: null, error: 'Supabase is not configured.' };
    }
    const { data, error } = await this.supabase.from('clubs').select('*').order('name');
    return { data: data as Club[] | null, error: error?.message ?? null };
  }

  async createClub(name: string): Promise<{ data: Club | null; error: string | null }> {
    if (!this.supabase) {
      return { data: null, error: 'Supabase is not configured.' };
    }
    const { data, error } = await this.supabase.rpc('create_club', { p_name: name });
    return { data: data as Club | null, error: error?.message ?? null };
  }

  async getClub(id: string): Promise<{ data: Club | null; error: string | null }> {
    if (!this.supabase) {
      return { data: null, error: 'Supabase is not configured.' };
    }
    const { data, error } = await this.supabase.from('clubs').select('*').eq('id', id).single();
    return { data: data as Club | null, error: error?.message ?? null };
  }
}
