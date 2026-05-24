import { Routes } from '@angular/router';
import { authGuard } from './app/auth-guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./app/login/login').then((module) => module.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () => import('./app/register/register').then((module) => module.RegisterPage),
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./app/forgot-password/forgot-password').then((module) => module.ForgotPasswordPage),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./app/reset-password/reset-password').then((module) => module.ResetPasswordPage),
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
