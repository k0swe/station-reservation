import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { AuthService } from '../../auth.service';

@Component({
  selector: 'app-home',
  imports: [MatButtonModule, MatCardModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  protected readonly auth = inject(AuthService);
  protected readonly authMessage = signal<string | null>(null);

  private readonly router = inject(Router);

  protected async signOut(): Promise<void> {
    const errorMessage = await this.auth.signOut();
    if (errorMessage) {
      this.authMessage.set(errorMessage);
      return;
    }

    this.authMessage.set(null);
    await this.router.navigate(['/login']);
  }
}
