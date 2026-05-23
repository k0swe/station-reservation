import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Club, ClubService } from '../../../club.service';

@Component({
  selector: 'app-create-club-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './create-club-dialog.html',
  styleUrl: './create-club-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateClubDialog {
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  private readonly clubService = inject(ClubService);
  private readonly dialogRef = inject(MatDialogRef<CreateClubDialog, Club>);

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.isSubmitting.set(true);

    const { name } = this.form.getRawValue();
    const { data, error } = await this.clubService.createClub(name);

    this.isSubmitting.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    this.dialogRef.close(data ?? undefined);
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
