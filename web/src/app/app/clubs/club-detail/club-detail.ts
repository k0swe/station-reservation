import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Club, ClubService } from '../../../club.service';

@Component({
  selector: 'app-club-detail',
  imports: [MatButtonModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: './club-detail.html',
  styleUrl: './club-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClubDetailPage implements OnInit {
  protected readonly club = signal<Club | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  private readonly clubService = inject(ClubService);
  private readonly route = inject(ActivatedRoute);

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    const { data, error } = await this.clubService.getClub(id);
    this.club.set(data);
    this.errorMessage.set(error);
    this.isLoading.set(false);
  }
}
