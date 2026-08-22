import { inject, Injectable } from '@angular/core';
import { ApiService } from './api.service';
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
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  getCurrentProfile(): Promise<{
    data: UserProfile | null;
    error: string | null;
  }> {
    return this.api.call<UserProfile>('getCurrentProfile');
  }

  listCurrentMemberships(): Promise<{
    data: MembershipSummary[] | null;
    error: string | null;
  }> {
    return this.api.call<MembershipSummary[]>('listCurrentMemberships');
  }

  async saveCurrentProfile(
    input: SaveProfileInput,
  ): Promise<{ data: UserProfile | null; error: string | null }> {
    const displayName = input.displayName.trim();
    const callsign = input.callsign.trim();
    const phoneNumber = input.phoneNumber.trim();

    const { data, error } = await this.api.call<UserProfile>('saveCurrentProfile', {
      displayName,
      callsign,
      phoneNumber,
    });

    if (error) {
      return { data: null, error };
    }

    const authError = await this.auth.updateAccountProfile(displayName, {
      callsign: callsign || null,
      phone_number: phoneNumber || null,
    });

    return { data, error: authError };
  }
}
