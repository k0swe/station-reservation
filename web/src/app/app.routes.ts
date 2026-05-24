import { Routes } from '@angular/router';
import { authGuard } from './app/auth-guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./app/login/login').then((module) => module.LoginPage),
  },
  {
    path: '',
    loadComponent: () => import('./app/home/home').then((module) => module.HomePage),
  },
  {
    path: 'clubs',
    loadComponent: () => import('./app/clubs/clubs').then((module) => module.ClubsPage),
    canActivate: [authGuard],
  },
  {
    path: 'clubs/:id',
    loadComponent: () => import('./app/clubs/club-detail/club-detail').then((module) => module.ClubDetailPage),
    canActivate: [authGuard],
  },
  {
    path: 'profile',
    loadComponent: () => import('./app/profile/profile').then((module) => module.ProfilePage),
    canActivate: [authGuard],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
