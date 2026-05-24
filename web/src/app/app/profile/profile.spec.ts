import { TestBed } from '@angular/core/testing';
import { ProfilePage } from './profile';
import { UserProfileService } from '../../user-profile.service';

class MockUserProfileService {
  getCurrentProfile = async () => ({
    data: {
      id: 'user-id',
      email: 'user@example.com',
      display_name: 'Example User',
      callsign: 'N0CALL',
      phone_number: '555-111-2222',
    },
    error: null,
  });

  listCurrentMemberships = async () => ({
    data: [{ id: 'm1', role: 'admin' as const, status: 'approved' as const, club: { id: 'c1', name: 'Test Club' } }],
    error: null,
  });

  saveCurrentProfile = async () => ({
    data: {
      id: 'user-id',
      email: 'user@example.com',
      display_name: 'Example User',
      callsign: 'N0CALL',
      phone_number: '555-111-2222',
    },
    error: null,
  });
}

describe('ProfilePage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfilePage],
      providers: [{ provide: UserProfileService, useClass: MockUserProfileService }],
    }).compileComponents();
  });

  it('loads and displays profile data', async () => {
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Edit account');
    expect(compiled.textContent).toContain('Club memberships');
    expect(compiled.textContent).toContain('Test Club');
  });
});
