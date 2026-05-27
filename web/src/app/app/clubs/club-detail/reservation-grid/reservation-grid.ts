import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { interval } from 'rxjs';
import { ClubReservation, Resource } from '../../../../club.service';

interface TimeSlot {
  startsAt: Date;
  label: string;
}

@Component({
  selector: 'app-reservation-grid',
  imports: [MatButtonModule],
  templateUrl: './reservation-grid.html',
  styleUrl: './reservation-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationGridComponent {
  readonly resources = input.required<Resource[]>();
  readonly reservations = input.required<ClubReservation[]>();
  /** Local midnight of the day to display. */
  readonly selectedDate = input.required<Date>();
  readonly isSubmitting = input(false);
  /** Set of resource IDs the current user has approved access to. */
  readonly approvedResourceIds = input.required<Set<string>>();
  /** The current user's membership ID (null if not a member). */
  readonly currentUserMembershipId = input<string | null>(null);
  /** Whether the current user is a club admin. */
  readonly isAdmin = input(false);
  readonly slotClick = output<{ resourceId: string; startsAt: Date; endsAt: Date }>();
  readonly reservationCancel = output<{ reservationId: string }>();
  private readonly destroyRef = inject(DestroyRef);
  private readonly nowMs = signal(Date.now());

  constructor() {
    interval(30_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.isSelectedDateToday()) {
          return;
        }
        this.nowMs.set(Date.now());
      });
  }

  /**
   * Row interval in minutes: the minimum block_size_minutes across all resources.
   * This ensures every resource has at least one valid slot per row.
   */
  protected readonly rowIntervalMinutes = computed(() => {
    const resources = this.resources();
    if (!resources.length) return 60;
    return resources.reduce((min, r) => Math.min(min, r.block_size_minutes), resources[0].block_size_minutes);
  });

  protected readonly timeSlots = computed((): TimeSlot[] => {
    const date = this.selectedDate();
    const intervalMs = this.rowIntervalMinutes() * 60 * 1000;
    // Use local midnight so the grid covers the user's calendar day.
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const slots: TimeSlot[] = [];
    for (let t = dayStart; t < dayEnd; t += intervalMs) {
      const d = new Date(t);
      const hh = d.getHours().toString().padStart(2, '0');
      const mm = d.getMinutes().toString().padStart(2, '0');
      slots.push({ startsAt: d, label: `${hh}:${mm}` });
    }
    return slots;
  });

  /** Short timezone abbreviation to display in the time column header (e.g. "MDT", "EST"). */
  protected readonly timezoneAbbr = computed((): string => {
    const ref = this.timeSlots()[0]?.startsAt ?? new Date();
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(ref);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'Local';
  });

  private isSelectedDateToday(): boolean {
    const selectedDate = this.selectedDate();
    const today = new Date();
    return (
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getDate() === today.getDate()
    );
  }

  protected getReservationForCell(resource: Resource, slot: TimeSlot): ClubReservation | null {
    const slotStart = slot.startsAt.getTime();
    const slotEnd = slotStart + this.rowIntervalMinutes() * 60 * 1000;
    return (
      this.reservations().find((r) => {
        if (r.resource_id !== resource.id) return false;
        const resStart = new Date(r.starts_at).getTime();
        const resEnd = new Date(r.ends_at).getTime();
        return resStart < slotEnd && resEnd > slotStart;
      }) ?? null
    );
  }

  /** Returns true when slot.startsAt falls on a block boundary for this resource. */
  protected isSlotAligned(resource: Resource, slot: TimeSlot): boolean {
    const epochSeconds = slot.startsAt.getTime() / 1000;
    return epochSeconds % (resource.block_size_minutes * 60) === 0;
  }

  /** Returns true when the slot has not yet ended (includes the currently-active block). */
  protected isSlotFuture(slot: TimeSlot): boolean {
    const slotEnd = slot.startsAt.getTime() + this.rowIntervalMinutes() * 60 * 1000;
    return slotEnd > this.nowMs();
  }

  protected getOwnerLabel(reservation: ClubReservation): string {
    return reservation.callsign ?? reservation.display_name ?? 'Reserved';
  }

  protected isApprovedForResource(resource: Resource): boolean {
    return this.approvedResourceIds().has(resource.id);
  }

  /**
   * Returns true when the current user can cancel this reservation:
   * they own it OR they are a club admin, and the reservation has not ended yet.
   */
  protected isCancellable(reservation: ClubReservation): boolean {
    if (new Date(reservation.ends_at).getTime() <= this.nowMs()) return false;
    if (this.isAdmin()) return true;
    return reservation.membership_id === this.currentUserMembershipId();
  }

  protected onSlotClick(resource: Resource, slot: TimeSlot): void {
    const startsAt = slot.startsAt;
    const endsAt = new Date(startsAt.getTime() + resource.block_size_minutes * 60 * 1000);
    this.slotClick.emit({ resourceId: resource.id, startsAt, endsAt });
  }

  protected onReservationClick(reservation: ClubReservation): void {
    const owner = this.getOwnerLabel(reservation);
    const confirmed = window.confirm(`Cancel the reservation for ${owner}?`);
    if (confirmed) {
      this.reservationCancel.emit({ reservationId: reservation.id });
    }
  }
}
