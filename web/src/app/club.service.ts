import { inject, Injectable } from '@angular/core';
import { AuthService } from './auth.service';

export interface Club {
  id: string;
  name: string;
  created_at: string;
}

export interface Resource {
  id: string;
  club_id: string;
  name: string;
  description: string | null;
  block_size_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateResourceInput {
  clubId: string;
  name: string;
  description: string | null;
  blockSizeMinutes: number;
  isActive?: boolean;
}

export interface ClubReservation {
  id: string;
  resource_id: string;
  membership_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  callsign: string | null;
  display_name: string | null;
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

  async listClubResources(clubId: string): Promise<{ data: Resource[] | null; error: string | null }> {
    if (!this.supabase) {
      return { data: null, error: 'Supabase is not configured.' };
    }

    const { data, error } = await this.supabase.from('resources').select('*').eq('club_id', clubId).order('name');
    return { data: data as Resource[] | null, error: error?.message ?? null };
  }

  async isClubAdmin(clubId: string): Promise<{ data: boolean; error: string | null }> {
    if (!this.supabase) {
      return { data: false, error: 'Supabase is not configured.' };
    }

    const userId = this.auth.user()?.id;
    if (!userId) {
      return { data: false, error: 'Not authenticated.' };
    }

    const { data, error } = await this.supabase
      .from('memberships')
      .select('id')
      .eq('club_id', clubId)
      .eq('user_id', userId)
      .eq('role', 'admin')
      .eq('status', 'approved')
      .maybeSingle();

    return { data: Boolean(data), error: error?.message ?? null };
  }

  async createResource(input: CreateResourceInput): Promise<{ data: Resource | null; error: string | null }> {
    if (!this.supabase) {
      return { data: null, error: 'Supabase is not configured.' };
    }

    const { data, error } = await this.supabase
      .from('resources')
      .insert({
        club_id: input.clubId,
        name: input.name,
        description: input.description,
        block_size_minutes: input.blockSizeMinutes,
        is_active: input.isActive ?? true,
      })
      .select()
      .single();

    return { data: data as Resource | null, error: error?.message ?? null };
  }

  async listClubReservations(
    clubId: string,
    from: Date,
    to: Date,
  ): Promise<{ data: ClubReservation[] | null; error: string | null }> {
    if (!this.supabase) {
      return { data: null, error: 'Supabase is not configured.' };
    }

    const { data, error } = await this.supabase.rpc('list_club_reservations', {
      p_club_id: clubId,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    });

    return { data: data as ClubReservation[] | null, error: error?.message ?? null };
  }

  async createReservation(
    resourceId: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<{ data: { id: string } | null; error: string | null }> {
    if (!this.supabase) {
      return { data: null, error: 'Supabase is not configured.' };
    }

    const { data, error } = await this.supabase.rpc('create_reservation', {
      p_resource_id: resourceId,
      p_starts_at: startsAt.toISOString(),
      p_ends_at: endsAt.toISOString(),
    });

    return { data: data as { id: string } | null, error: error?.message ?? null };
  }
}
