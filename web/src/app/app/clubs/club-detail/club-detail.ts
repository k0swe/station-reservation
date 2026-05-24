import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Club, ClubReservation, ClubService, Resource } from '../../../club.service';
import { ReservationGridComponent } from './reservation-grid/reservation-grid';

@Component({
  selector: 'app-club-detail',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
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

  protected readonly selectedDateLabel = computed(() => {
    return this.selectedDate().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  });

  /** Active resources only, for display in the reservation grid. */
  protected readonly activeResources = computed(() => (this.resources() ?? []).filter((r) => r.is_active));

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    blockSizeMinutes: new FormControl(60, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
  });

  private readonly clubService = inject(ClubService);
  private readonly route = inject(ActivatedRoute);
  private clubId = '';

  async ngOnInit(): Promise<void> {
    this.clubId = this.route.snapshot.paramMap.get('id') ?? '';

    const [clubResult, resourcesResult, isAdminResult] = await Promise.all([
      this.clubService.getClub(this.clubId),
      this.clubService.listClubResources(this.clubId),
      this.clubService.isClubAdmin(this.clubId),
    ]);

    this.club.set(clubResult.data);
    this.errorMessage.set(clubResult.error);
    this.resources.set(resourcesResult.data);
    this.resourcesError.set(resourcesResult.error);
    this.isClubAdmin.set(isAdminResult.data);

    this.isLoading.set(false);

    await this.loadReservations();
  }

  protected prevDay(): void {
    const d = this.selectedDate();
    this.selectedDate.set(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
    void this.loadReservations();
  }

  protected nextDay(): void {
    const d = this.selectedDate();
    this.selectedDate.set(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
    void this.loadReservations();
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

  private async loadReservations(): Promise<void> {
    const date = this.selectedDate();
    const from = new Date(date.getFullYear(), date.getMonth(), date.getDate()); // local midnight
    const to = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1); // next local midnight
    const result = await this.clubService.listClubReservations(this.clubId, from, to);
    this.reservations.set(result.data);
    this.reservationsError.set(result.error);
  }

  private localMidnightToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}
