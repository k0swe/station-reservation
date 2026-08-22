import { inject, Injectable } from '@angular/core';
import { ApiService } from './api.service';

export interface Club {
  id: string;
  name: string;
  slug: string | null;
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

export interface Membership {
  id: string;
  club_id: string;
  user_id: string;
  role: 'admin' | 'member';
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
  updated_at: string;
}

export interface ResourceAccessApproval {
  id: string;
  resource_id: string;
  status: 'pending' | 'approved' | 'denied';
}

export interface ResourceAccessRequest {
  id: string;
  resource_id: string;
  resource_name: string;
  membership_id: string;
  user_display_name: string | null;
  user_callsign: string | null;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
  updated_at: string;
}

export interface MembershipRequest {
  id: string;
  club_id: string;
  user_id: string;
  role: 'admin' | 'member';
  status: 'pending' | 'approved' | 'denied';
  user_display_name: string | null;
  user_callsign: string | null;
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

export interface UpdateResourceInput {
  resourceId: string;
  name: string;
  description: string | null;
  blockSizeMinutes: number;
  isActive: boolean;
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
  private readonly api = inject(ApiService);

  listClubs(): Promise<{ data: Club[] | null; error: string | null }> {
    return this.api.call<Club[]>('listClubs');
  }

  createClub(name: string, slug: string | null): Promise<{ data: Club | null; error: string | null }> {
    return this.api.call<Club>('createClub', { name, slug });
  }

  getClub(identifier: string): Promise<{ data: Club | null; error: string | null }> {
    return this.api.call<Club>('getClub', { identifier: identifier.trim() });
  }

  listClubResources(clubId: string): Promise<{ data: Resource[] | null; error: string | null }> {
    return this.api.call<Resource[]>('listClubResources', { clubId });
  }

  async isClubAdmin(clubId: string): Promise<{ data: boolean; error: string | null }> {
    const { data, error } = await this.api.call<boolean>('isClubAdmin', {
      clubId,
    });
    return { data: data === true, error };
  }

  createResource(input: CreateResourceInput): Promise<{ data: Resource | null; error: string | null }> {
    return this.api.call<Resource>('createResource', { ...input });
  }

  updateResource(input: UpdateResourceInput): Promise<{ data: Resource | null; error: string | null }> {
    return this.api.call<Resource>('updateResource', { ...input });
  }

  async deleteResource(resourceId: string): Promise<{ error: string | null }> {
    const { error } = await this.api.call<null>('deleteResource', {
      resourceId,
    });
    return { error };
  }

  listClubReservations(
    clubId: string,
    from: Date,
    to: Date,
  ): Promise<{ data: ClubReservation[] | null; error: string | null }> {
    return this.api.call<ClubReservation[]>('listClubReservations', {
      clubId,
      from: from.toISOString(),
      to: to.toISOString(),
    });
  }

  createReservation(
    resourceId: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<{ data: { id: string } | null; error: string | null }> {
    return this.api.call<{ id: string }>('createReservation', {
      resourceId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    });
  }

  requestMembership(clubId: string): Promise<{ data: Membership | null; error: string | null }> {
    return this.api.call<Membership>('requestMembership', { clubId });
  }

  getUserMembership(clubId: string): Promise<{ data: Membership | null; error: string | null }> {
    return this.api.call<Membership>('getUserMembership', { clubId });
  }

  getMyResourceApprovals(
    clubId: string,
  ): Promise<{ data: ResourceAccessApproval[] | null; error: string | null }> {
    return this.api.call<ResourceAccessApproval[]>('getMyResourceApprovals', {
      clubId,
    });
  }

  applyForResourceAccess(
    membershipId: string,
    resourceId: string,
  ): Promise<{ data: ResourceAccessApproval | null; error: string | null }> {
    return this.api.call<ResourceAccessApproval>('applyForResourceAccess', {
      membershipId,
      resourceId,
    });
  }

  listClubResourceAccessRequests(
    clubId: string,
  ): Promise<{ data: ResourceAccessRequest[] | null; error: string | null }> {
    return this.api.call<ResourceAccessRequest[]>('listClubResourceAccessRequests', { clubId });
  }

  setResourceAccessStatus(
    approvalId: string,
    status: 'approved' | 'denied',
  ): Promise<{ data: ResourceAccessApproval | null; error: string | null }> {
    return this.api.call<ResourceAccessApproval>('setResourceAccessStatus', {
      approvalId,
      status,
    });
  }

  listClubMembershipRequests(
    clubId: string,
  ): Promise<{ data: MembershipRequest[] | null; error: string | null }> {
    return this.api.call<MembershipRequest[]>('listClubMembershipRequests', {
      clubId,
    });
  }

  setMembershipStatus(
    membershipId: string,
    status: 'approved' | 'denied',
  ): Promise<{ data: Membership | null; error: string | null }> {
    return this.api.call<Membership>('setMembershipStatus', {
      membershipId,
      status,
    });
  }

  setMemberRole(
    membershipId: string,
    role: 'admin' | 'member',
  ): Promise<{ data: Membership | null; error: string | null }> {
    return this.api.call<Membership>('setMemberRole', { membershipId, role });
  }

  cancelReservation(
    reservationId: string,
    notes?: string,
  ): Promise<{ data: ClubReservation | null; error: string | null }> {
    return this.api.call<ClubReservation>('cancelReservation', {
      reservationId,
      notes: notes ?? null,
    });
  }
}
