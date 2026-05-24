import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MembershipSummary, UserProfileService } from '../../user-profile.service';

@Component({
  selector: 'app-profile',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage implements OnInit {
  protected readonly form = new FormGroup({
    email: new FormControl({ value: '', disabled: true }, { nonNullable: true }),
    displayName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    callsign: new FormControl('', { nonNullable: true }),
    phoneNumber: new FormControl('', { nonNullable: true }),
  });
  protected readonly memberships = signal<MembershipSummary[] | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly saveMessage = signal<string | null>(null);

  private readonly profileService = inject(UserProfileService);

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  protected async saveProfile(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.saveMessage.set(null);
    this.isSaving.set(true);

    const { displayName, callsign, phoneNumber } = this.form.getRawValue();
    const { data, error } = await this.profileService.saveCurrentProfile({
      displayName,
      callsign,
      phoneNumber,
    });

    this.isSaving.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    if (data) {
      this.form.reset({
        email: data.email ?? '',
        displayName: data.display_name ?? '',
        callsign: data.callsign ?? '',
        phoneNumber: data.phone_number ?? '',
      });
    }

    this.saveMessage.set('Profile updated.');
  }

  protected roleLabel(role: MembershipSummary['role']): string {
    return role === 'admin' ? 'Admin' : 'Member';
  }

  protected statusLabel(status: MembershipSummary['status']): string {
    switch (status) {
      case 'approved':
        return 'Approved';
      case 'denied':
        return 'Denied';
      default:
        return 'Pending';
    }
  }

  private async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const [profileResult, membershipsResult] = await Promise.all([
      this.profileService.getCurrentProfile(),
      this.profileService.listCurrentMemberships(),
    ]);

    if (profileResult.data) {
      this.form.reset({
        email: profileResult.data.email ?? '',
        displayName: profileResult.data.display_name ?? '',
        callsign: profileResult.data.callsign ?? '',
        phoneNumber: profileResult.data.phone_number ?? '',
      });
    }

    this.memberships.set(membershipsResult.data);
    this.errorMessage.set(profileResult.error ?? membershipsResult.error);
    this.isLoading.set(false);
  }
}
