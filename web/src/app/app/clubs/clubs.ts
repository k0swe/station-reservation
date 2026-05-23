import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { Club, ClubService } from '../../club.service';
import { CreateClubDialog } from './create-club-dialog/create-club-dialog';

@Component({
  selector: 'app-clubs',
  imports: [MatButtonModule, MatIconModule, MatListModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: './clubs.html',
  styleUrl: './clubs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClubsPage implements OnInit {
  protected readonly clubs = signal<Club[] | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  private readonly clubService = inject(ClubService);
  private readonly dialog = inject(MatDialog);

  async ngOnInit(): Promise<void> {
    await this.loadClubs();
  }

  protected openCreateDialog(): void {
    const dialogRef = this.dialog.open(CreateClubDialog);
    dialogRef.afterClosed().subscribe((newClub: Club | undefined) => {
      if (newClub) {
        this.clubs.update((existing) => {
          const updated = [...(existing ?? []), newClub];
          return updated.sort((a, b) => a.name.localeCompare(b.name));
        });
      }
    });
  }

  private async loadClubs(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    const { data, error } = await this.clubService.listClubs();
    this.clubs.set(data);
    this.errorMessage.set(error);
    this.isLoading.set(false);
  }
}
