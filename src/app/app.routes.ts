import { Routes } from '@angular/router';

export const routes: Routes = [

  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login').then(m => m.LoginComponent)
  },

  {
    path: 'changer-mot-de-passe',
    loadComponent: () =>
      import('./pages/changer-mot-de-passe/changer-mot-de-passe')
        .then(m => m.ChangerMotDePasseComponent)
  },

  {
    path: 'accueil',
    loadComponent: () =>
      import('./pages/accueil/accueil')
        .then(m => m.AccueilComponent)
  },

  {
    path: 'collectes',
    loadComponent: () =>
      import('./pages/collectes/collectes')
        .then(m => m.CollectesComponent)
  },

  {
    path: 'coordonnees',
    loadComponent: () =>
      import('./pages/coordonnees/coordonnees')
        .then(m => m.Coordonnees)
  },

  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  }

];