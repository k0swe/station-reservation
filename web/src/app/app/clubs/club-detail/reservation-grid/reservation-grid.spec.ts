import { TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';
import { ReservationGridComponent } from './reservation-grid';
import { ClubReservation, Resource } from '../../../../club.service';

describe('ReservationGridComponent', () => {
  const selectedDate = new Date(2026, 4, 25);
  const resource: Resource = {
    id: 'resource-1',
    club_id: 'club-1',
    name: 'Station 1',
    description: null,
    block_size_minutes: 60,
    is_active: true,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservationGridComponent],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows cancellation for an in-progress reservation owned by the current member', () => {
    const now = new Date('2026-05-25T12:30:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const reservation = createReservation({
      starts_at: '2026-05-25T12:00:00.000Z',
      ends_at: '2026-05-25T13:00:00.000Z',
      membership_id: 'membership-1',
    });

    const fixture = TestBed.createComponent(ReservationGridComponent);
    fixture.componentRef.setInput('resources', [resource]);
    fixture.componentRef.setInput('reservations', [reservation]);
    fixture.componentRef.setInput('selectedDate', selectedDate);
    fixture.componentRef.setInput('approvedResourceIds', new Set<string>([resource.id]));
    fixture.componentRef.setInput('currentUserMembershipId', 'membership-1');
    fixture.componentRef.setInput('isAdmin', false);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.reservation-chip--cancellable');
    expect(button?.textContent?.trim()).toBe('K0ABC');
  });

  it('does not show cancellation for a reservation that has already ended', () => {
    const now = new Date('2026-05-25T13:30:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const reservation = createReservation({
      starts_at: '2026-05-25T12:00:00.000Z',
      ends_at: '2026-05-25T13:00:00.000Z',
      membership_id: 'membership-1',
    });

    const fixture = TestBed.createComponent(ReservationGridComponent);
    fixture.componentRef.setInput('resources', [resource]);
    fixture.componentRef.setInput('reservations', [reservation]);
    fixture.componentRef.setInput('selectedDate', selectedDate);
    fixture.componentRef.setInput('approvedResourceIds', new Set<string>([resource.id]));
    fixture.componentRef.setInput('currentUserMembershipId', 'membership-1');
    fixture.componentRef.setInput('isAdmin', false);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.reservation-chip--cancellable');
    const label = fixture.nativeElement.querySelector('.reservation-chip');
    expect(button).toBeNull();
    expect(label?.textContent?.trim()).toBe('K0ABC');
  });
});

function createReservation(overrides: Partial<ClubReservation>): ClubReservation {
  return {
    id: 'reservation-1',
    resource_id: 'resource-1',
    membership_id: 'membership-1',
    starts_at: '2026-05-25T12:00:00.000Z',
    ends_at: '2026-05-25T13:00:00.000Z',
    status: 'active',
    callsign: 'K0ABC',
    display_name: 'Operator',
    ...overrides,
  };
}
