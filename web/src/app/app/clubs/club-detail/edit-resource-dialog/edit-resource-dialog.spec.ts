import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ClubService, Resource } from '../../../../club.service';
import { EditResourceDialog } from './edit-resource-dialog';

describe('EditResourceDialog', () => {
  const resource: Resource = {
    id: 'resource-1',
    club_id: 'club-1',
    name: 'Station 1',
    description: 'Original',
    block_size_minutes: 60,
    is_active: true,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
  };

  const dialogRef = { close: vi.fn() };
  const clubService = {
    updateResource: vi.fn(),
    deleteResource: vi.fn(),
  };
  const dialog = {
    open: vi.fn(),
  };

  beforeEach(async () => {
    dialogRef.close.mockReset();
    clubService.updateResource.mockReset();
    clubService.deleteResource.mockReset();
    dialog.open.mockReset();

    await TestBed.configureTestingModule({
      imports: [EditResourceDialog, NoopAnimationsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: resource },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: ClubService, useValue: clubService },
        { provide: MatDialog, useValue: dialog },
      ],
    }).compileComponents();
  });

  it('saves updated station details', async () => {
    clubService.updateResource.mockResolvedValue({
      data: { ...resource, name: 'Updated Station', description: null, block_size_minutes: 30, is_active: false },
      error: null,
    });

    const fixture = TestBed.createComponent(EditResourceDialog);
    const component = fixture.componentInstance as EditResourceDialog & {
      form: { setValue: (value: { name: string; description: string; blockSizeMinutes: number; isActive: boolean }) => void };
      submit: () => Promise<void>;
      deleteResource: () => Promise<void>;
    };

    component.form.setValue({
      name: 'Updated Station',
      description: '',
      blockSizeMinutes: 30,
      isActive: false,
    });

    await component.submit();

    expect(clubService.updateResource).toHaveBeenCalledWith({
      resourceId: 'resource-1',
      name: 'Updated Station',
      description: null,
      blockSizeMinutes: 30,
      isActive: false,
    });
    expect(dialogRef.close).toHaveBeenCalledWith({
      kind: 'updated',
      resource: { ...resource, name: 'Updated Station', description: null, block_size_minutes: 30, is_active: false },
    });
  });

  it('deletes the station after confirmation', async () => {
    dialog.open.mockReturnValue({
      afterClosed: () => of(true),
    });
    clubService.deleteResource.mockResolvedValue({ error: null });

    const fixture = TestBed.createComponent(EditResourceDialog);
    const component = fixture.componentInstance as EditResourceDialog & {
      deleteResource: () => Promise<void>;
    };

    await component.deleteResource();

    expect(dialog.open).toHaveBeenCalled();
    expect(clubService.deleteResource).toHaveBeenCalledWith('resource-1');
    expect(dialogRef.close).toHaveBeenCalledWith({ kind: 'deleted', resourceId: 'resource-1' });
  });
});
