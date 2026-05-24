import { inject, Injectable } from '@angular/core';
import { AuthService } from './auth.service';

export interface UserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  callsign: string | null;
  phone_number: string | null;
}

export interface MembershipSummary {
  id: string;
  role: 'admin' | 'member';
  status: 'pending' | 'approved' | 'denied';
  club: {
    id: string;
    name: string;
  } | null;
}

export interface SaveProfileInput {
  displayName: string;
  callsign: string;
  phoneNumber: string;
}

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly auth = inject(AuthService);

  private get supabase() {
    return this.auth.supabase;
  }

  async getCurrentProfile(): Promise<{ data: UserProfile | null; error: string | null }> {
    if (!this.supabase) {
      return { data: null, error: 'Supabase is not configured.' };
    }

    const userId = this.auth.user()?.id;
    if (!userId) {
      return { data: null, error: 'Not authenticated.' };
    }

    const { data, error } = await this.supabase
      .from('users')
      .select('id, email, display_name, callsign, phone_number')
      .eq('id', userId)
      .single();

    return { data: data as UserProfile | null, error: error?.message ?? null };
  }

  async listCurrentMemberships(): Promise<{ data: MembershipSummary[] | null; error: string | null }> {
    if (!this.supabase) {
      return { data: null, error: 'Supabase is not configured.' };
    }

    const { data, error } = await this.supabase
      .from('memberships')
      .select('id, role, status, club:clubs(id, name)')
      .order('created_at', { ascending: false });

    return { data: data as MembershipSummary[] | null, error: error?.message ?? null };
  }

  async saveCurrentProfile(input: SaveProfileInput): Promise<{ data: UserProfile | null; error: string | null }> {
    if (!this.supabase) {
      return { data: null, error: 'Supabase is not configured.' };
    }

    const userId = this.auth.user()?.id;
    if (!userId) {
      return { data: null, error: 'Not authenticated.' };
    }

    const displayName = input.displayName.trim();
    const callsign = input.callsign.trim();
    const phoneNumber = input.phoneNumber.trim();

    const { data, error } = await this.supabase
      .from('users')
      .update({
        display_name: displayName,
        callsign: callsign || null,
        phone_number: phoneNumber || null,
      })
      .eq('id', userId)
      .select('id, email, display_name, callsign, phone_number')
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    const authError = await this.auth.updateUserMetadata({
      display_name: displayName,
      callsign: callsign || null,
      phone_number: phoneNumber || null,
    });

    if (authError) {
      return { data: data as UserProfile | null, error: authError };
    }

    return { data: data as UserProfile | null, error: null };
  }
}
