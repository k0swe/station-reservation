import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
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
  readonly slotClick = output<{ resourceId: string; startsAt: Date; endsAt: Date }>();

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
    return slotEnd > Date.now();
  }

  protected getOwnerLabel(reservation: ClubReservation): string {
    return reservation.callsign ?? reservation.display_name ?? 'Reserved';
  }

  protected onSlotClick(resource: Resource, slot: TimeSlot): void {
    const startsAt = slot.startsAt;
    const endsAt = new Date(startsAt.getTime() + resource.block_size_minutes * 60 * 1000);
    this.slotClick.emit({ resourceId: resource.id, startsAt, endsAt });
  }
}
