import { TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  Club,
  ClubReservation,
  ClubService,
  Membership,
  MembershipRequest,
  Resource,
  ResourceAccessApproval,
  ResourceAccessRequest,
} from '../../../club.service';
import { ReservationGridComponent } from './reservation-grid/reservation-grid';

@Component({
  selector: 'app-club-detail',
  imports: [
    TitleCasePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    RouterLink,
    ReservationGridComponent,
  ],
  templateUrl: './club-detail.html',
  styleUrl: './club-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClubDetailPage implements OnInit {
  protected readonly club = signal<Club | null>(null);
  protected readonly resources = signal<Resource[] | null>(null);
  protected readonly resourcesError = signal<string | null>(null);
  protected readonly isClubAdmin = signal(false);
  protected readonly isSubmittingResource = signal(false);
  protected readonly createResourceError = signal<string | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly selectedDate = signal<Date>(this.localMidnightToday());
  protected readonly reservations = signal<ClubReservation[] | null>(null);
  protected readonly reservationsError = signal<string | null>(null);
  protected readonly isCreatingReservation = signal(false);
  protected readonly reservationError = signal<string | null>(null);
  protected readonly isCancellingReservation = signal(false);
  protected readonly cancelReservationError = signal<string | null>(null);

  /** The current user's membership in this club (null if not a member). */
  protected readonly userMembership = signal<Membership | null>(null);
  /** True when the user has an approved membership (enables schedule/resources view). */
  protected readonly isApprovedMember = computed(() => this.userMembership()?.status === 'approved');
  /** True while a membership request is being submitted. */
  protected readonly isRequestingMembership = signal(false);
  /** Error message from a failed membership request. */
  protected readonly membershipRequestError = signal<string | null>(null);
  /** Map of resourceId → approval status for the current user. */
  protected readonly userApprovals = signal<Map<string, ResourceAccessApproval>>(new Map());
  /** Which resource ID is currently being applied for (null if none). */
  protected readonly applyingForResourceId = signal<string | null>(null);
  /** Per-resource apply errors, keyed by resource ID. */
  protected readonly applyError = signal<Map<string, string>>(new Map());

  /** Pending/all resource access requests visible to admins. */
  protected readonly accessRequests = signal<ResourceAccessRequest[] | null>(null);
  protected readonly accessRequestsError = signal<string | null>(null);
  /** Which approval ID is being actioned (approve/deny) right now. */
  protected readonly actioningApprovalId = signal<string | null>(null);
  protected readonly approvalActionError = signal<string | null>(null);

  /** All membership requests for the club, visible to admins. */
  protected readonly membershipRequests = signal<MembershipRequest[] | null>(null);
  protected readonly membershipRequestsError = signal<string | null>(null);
  /** Which membership ID is being actioned (approve/deny) right now. */
  protected readonly actioningMembershipId = signal<string | null>(null);
  protected readonly membershipActionError = signal<string | null>(null);

  protected readonly selectedDateLabel = computed(() => {
    return this.selectedDate().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  });
  protected readonly isSelectedDateToday = computed(
    () => this.selectedDate().getTime() === this.localMidnightToday().getTime(),
  );

  /** Active resources only, for display in the reservation grid. */
  protected readonly activeResources = computed(() => (this.resources() ?? []).filter((r) => r.is_active));

  /** Set of resource IDs the current user has been approved for. */
  protected readonly approvedResourceIds = computed(() => {
    const ids = new Set<string>();
    this.userApprovals().forEach((approval) => {
      if (approval.status === 'approved') {
        ids.add(approval.resource_id);
      }
    });
    return ids;
  });

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    blockSizeMinutes: new FormControl(60, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
  });

  private readonly clubService = inject(ClubService);
  private readonly route = inject(ActivatedRoute);
  private clubId = '';

  async ngOnInit(): Promise<void> {
    const clubIdentifier = this.route.snapshot.paramMap.get('id') ?? '';
    const clubResult = await this.clubService.getClub(clubIdentifier);

    this.club.set(clubResult.data);
    this.errorMessage.set(clubResult.error);
    this.clubId = clubResult.data?.id ?? '';

    if (!this.clubId || clubResult.error) {
      this.isLoading.set(false);
      return;
    }

    const [resourcesResult, isAdminResult, membershipResult] = await Promise.all([
      this.clubService.listClubResources(this.clubId),
      this.clubService.isClubAdmin(this.clubId),
      this.clubService.getUserMembership(this.clubId),
    ]);

    this.resources.set(resourcesResult.data);
    this.resourcesError.set(resourcesResult.error);
    this.isClubAdmin.set(isAdminResult.data);
    this.userMembership.set(membershipResult.data);

    this.isLoading.set(false);

    // Load reservations, user approvals, and (for admins) access requests in parallel.
    const parallelLoads: Promise<void>[] = [this.loadReservations(), this.loadUserApprovals()];
    if (isAdminResult.data) {
      parallelLoads.push(this.loadAccessRequests(), this.loadMembershipRequests());
    }
    await Promise.all(parallelLoads);
  }

  protected prevDay(): void {
    const d = this.selectedDate();
    this.setAndLoadDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
  }

  protected nextDay(): void {
    const d = this.selectedDate();
    this.setAndLoadDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
  }

  protected setSelectedDate(date: Date | null): void {
    if (!date) {
      return;
    }
    this.setAndLoadDate(date);
  }

  protected goToToday(): void {
    if (this.isSelectedDateToday()) {
      return;
    }
    this.setAndLoadDate(this.localMidnightToday());
  }

  protected async onSlotClick(event: { resourceId: string; startsAt: Date; endsAt: Date }): Promise<void> {
    this.reservationError.set(null);
    this.isCreatingReservation.set(true);
    const { error } = await this.clubService.createReservation(event.resourceId, event.startsAt, event.endsAt);
    this.isCreatingReservation.set(false);

    if (error) {
      this.reservationError.set(error);
      return;
    }

    await this.loadReservations();
  }

  protected async onReservationCancel(event: { reservationId: string }): Promise<void> {
    this.cancelReservationError.set(null);
    this.isCancellingReservation.set(true);
    const { error } = await this.clubService.cancelReservation(event.reservationId);
    this.isCancellingReservation.set(false);

    if (error) {
      this.cancelReservationError.set(error);
      return;
    }

    await this.loadReservations();
  }

  protected async requestMembership(): Promise<void> {
    this.membershipRequestError.set(null);
    this.isRequestingMembership.set(true);
    const { data, error } = await this.clubService.requestMembership(this.clubId);
    this.isRequestingMembership.set(false);

    if (error) {
      this.membershipRequestError.set(error);
      return;
    }

    if (data) {
      this.userMembership.set(data);
    }
  }

  protected async submitResource(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const clubId = this.club()?.id;
    if (!clubId) {
      return;
    }

    this.createResourceError.set(null);
    this.isSubmittingResource.set(true);

    const { name, description, blockSizeMinutes } = this.form.getRawValue();
    const { data, error } = await this.clubService.createResource({
      clubId,
      name,
      description: description.trim() ? description.trim() : null,
      blockSizeMinutes,
      isActive: true,
    });

    this.isSubmittingResource.set(false);

    if (error) {
      this.createResourceError.set(error);
      return;
    }

    if (data) {
      this.resources.update((existing) => {
        const updated = [...(existing ?? []), data];
        return updated.sort((a, b) => a.name.localeCompare(b.name));
      });
      this.form.reset({ name: '', description: '', blockSizeMinutes: 60 });
    }
  }

  protected getApprovalStatus(resourceId: string): 'pending' | 'approved' | 'denied' | null {
    return this.userApprovals().get(resourceId)?.status ?? null;
  }

  protected async applyForAccess(resourceId: string): Promise<void> {
    const membership = this.userMembership();
    if (!membership) return;

    this.applyingForResourceId.set(resourceId);
    this.applyError.update((m) => {
      const next = new Map(m);
      next.delete(resourceId);
      return next;
    });

    const { data, error } = await this.clubService.applyForResourceAccess(membership.id, resourceId);
    this.applyingForResourceId.set(null);

    if (error) {
      this.applyError.update((m) => {
        const next = new Map(m);
        next.set(resourceId, error);
        return next;
      });
      return;
    }

    if (data) {
      this.userApprovals.update((m) => {
        const next = new Map(m);
        next.set(resourceId, data);
        return next;
      });
    }
  }

  protected async approveRequest(approvalId: string): Promise<void> {
    await this.setRequestStatus(approvalId, 'approved');
  }

  protected async denyRequest(approvalId: string): Promise<void> {
    await this.setRequestStatus(approvalId, 'denied');
  }

  private async setRequestStatus(approvalId: string, status: 'approved' | 'denied'): Promise<void> {
    this.actioningApprovalId.set(approvalId);
    this.approvalActionError.set(null);

    const { error } = await this.clubService.setResourceAccessStatus(approvalId, status);
    this.actioningApprovalId.set(null);

    if (error) {
      this.approvalActionError.set(error);
      return;
    }

    // Refresh the requests list and (if the user is the one being actioned) their own approvals.
    await Promise.all([this.loadAccessRequests(), this.loadUserApprovals()]);
  }

  protected async approveMembership(membershipId: string): Promise<void> {
    await this.setMembershipRequestStatus(membershipId, 'approved');
  }

  protected async denyMembership(membershipId: string): Promise<void> {
    await this.setMembershipRequestStatus(membershipId, 'denied');
  }

  protected async promoteMember(membershipId: string): Promise<void> {
    await this.setMembershipRole(membershipId, 'admin');
  }

  protected async demoteAdmin(membershipId: string): Promise<void> {
    await this.setMembershipRole(membershipId, 'member');
  }

  private async setMembershipRequestStatus(membershipId: string, status: 'approved' | 'denied'): Promise<void> {
    this.actioningMembershipId.set(membershipId);
    this.membershipActionError.set(null);

    const { error } = await this.clubService.setMembershipStatus(membershipId, status);
    this.actioningMembershipId.set(null);

    if (error) {
      this.membershipActionError.set(error);
      return;
    }

    await this.loadMembershipRequests();
  }

  private async setMembershipRole(membershipId: string, role: 'admin' | 'member'): Promise<void> {
    this.actioningMembershipId.set(membershipId);
    this.membershipActionError.set(null);

    const { error } = await this.clubService.setMemberRole(membershipId, role);
    this.actioningMembershipId.set(null);

    if (error) {
      this.membershipActionError.set(error);
      return;
    }

    await this.loadMembershipRequests();
  }

  private async loadReservations(): Promise<void> {
    const date = this.selectedDate();
    const from = new Date(date.getFullYear(), date.getMonth(), date.getDate()); // local midnight
    const to = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1); // next local midnight
    const result = await this.clubService.listClubReservations(this.clubId, from, to);
    this.reservations.set(result.data);
    this.reservationsError.set(result.error);
  }

  private async loadUserApprovals(): Promise<void> {
    const { data } = await this.clubService.getMyResourceApprovals(this.clubId);
    if (data) {
      const map = new Map<string, ResourceAccessApproval>();
      data.forEach((a) => map.set(a.resource_id, a));
      this.userApprovals.set(map);
    }
  }

  private async loadAccessRequests(): Promise<void> {
    const { data, error } = await this.clubService.listClubResourceAccessRequests(this.clubId);
    this.accessRequests.set(data);
    this.accessRequestsError.set(error);
  }

  private async loadMembershipRequests(): Promise<void> {
    const { data, error } = await this.clubService.listClubMembershipRequests(this.clubId);
    this.membershipRequests.set(data);
    this.membershipRequestsError.set(error);
  }

  private localMidnightToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  private setAndLoadDate(date: Date): void {
    this.selectedDate.set(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
    void this.loadReservations();
  }
}
