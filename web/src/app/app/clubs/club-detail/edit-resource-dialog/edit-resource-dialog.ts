import { computed, ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { ClubService, Resource } from '../../../../club.service';
import { ConfirmDialog } from '../confirm-dialog/confirm-dialog';

export type EditResourceDialogResult =
  | { kind: 'updated'; resource: Resource }
  | { kind: 'deleted'; resourceId: string };

@Component({
  selector: 'app-edit-resource-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './edit-resource-dialog.html',
  styleUrl: './edit-resource-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditResourceDialog {
  protected readonly resource = inject<Resource>(MAT_DIALOG_DATA);
  protected readonly isSubmitting = signal(false);
  protected readonly isDeleting = signal(false);
  protected readonly isBusy = computed(() => this.isSubmitting() || this.isDeleting());
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly form = new FormGroup({
    name: new FormControl(this.resource.name, { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl(this.resource.description ?? '', { nonNullable: true }),
    blockSizeMinutes: new FormControl(this.resource.block_size_minutes, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    isActive: new FormControl(this.resource.is_active, { nonNullable: true }),
  });

  private readonly clubService = inject(ClubService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<EditResourceDialog, EditResourceDialogResult>);

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.isSubmitting.set(true);

    const { name, description, blockSizeMinutes, isActive } = this.form.getRawValue();
    const { data, error } = await this.clubService.updateResource({
      resourceId: this.resource.id,
      name,
      description: description.trim() ? description.trim() : null,
      blockSizeMinutes,
      isActive,
    });

    this.isSubmitting.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    if (data) {
      this.dialogRef.close({ kind: 'updated', resource: data });
    }
  }

  protected async deleteResource(): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialog, {
          data: {
            title: 'Delete station',
            message: `Delete ${this.resource.name}? This cannot be undone.`,
            confirmLabel: 'Delete',
          },
        })
        .afterClosed(),
    );

    if (!confirmed) {
      return;
    }

    this.errorMessage.set(null);
    this.isDeleting.set(true);

    const { error } = await this.clubService.deleteResource(this.resource.id);
    this.isDeleting.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    this.dialogRef.close({ kind: 'deleted', resourceId: this.resource.id });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
