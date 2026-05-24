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

  it('loads profile data and memberships', async () => {
    const fixture = TestBed.createComponent(ProfilePage);
    const page = fixture.componentInstance as unknown as {
      ngOnInit: () => Promise<void>;
      memberships: () => Array<{ club: { name: string } | null }> | null;
      form: { getRawValue: () => { email: string; displayName: string } };
      isLoading: () => boolean;
    };

    await page.ngOnInit();

    expect(page.memberships()?.[0]?.club?.name).toBe('Test Club');
    expect(page.form.getRawValue().email).toBe('user@example.com');
    expect(page.form.getRawValue().displayName).toBe('Example User');
    expect(page.isLoading()).toBe(false);
  });
});
