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
    canActivate: [authGuard],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
