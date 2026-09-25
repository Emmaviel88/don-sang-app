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
    redirectTo: 'coordonnees',
    pathMatch: 'full'
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
    path: 'statistiques',
    loadComponent: () =>
      import('./pages/statistiques/statistiques')
        .then(m => m.Statistiques)
  },

  {
    path: 'adhesion-amicale',
    loadComponent: () =>
      import('./pages/adhesion-amicale/adhesion-amicale')
        .then(m => m.AdhesionAmicale)
  },

  {
    path: 'comite',
    loadComponent: () =>
      import('./pages/comite/comite')
        .then(m => m.Comite)
  },

  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  }

];