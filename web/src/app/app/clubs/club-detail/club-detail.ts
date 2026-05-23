import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Club, ClubService, Resource } from '../../../club.service';

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
  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    blockSizeMinutes: new FormControl(60, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
  });

  private readonly clubService = inject(ClubService);
  private readonly route = inject(ActivatedRoute);

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';

    const [clubResult, resourcesResult, isAdminResult] = await Promise.all([
      this.clubService.getClub(id),
      this.clubService.listClubResources(id),
      this.clubService.isClubAdmin(id),
    ]);

    this.club.set(clubResult.data);
    this.errorMessage.set(clubResult.error);
    this.resources.set(resourcesResult.data);
    this.resourcesError.set(resourcesResult.error);
    this.isClubAdmin.set(isAdminResult.data);

    this.isLoading.set(false);
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
}
