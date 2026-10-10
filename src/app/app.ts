import { Component, effect } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { SupabaseService } from './services/supabase';
import { SessionService } from './services/session';
import { ThemeService } from './services/theme';
import { CompteursContactsService } from './services/compteurs-contacts';
import { environment } from '../environments/environment';
import { TooltipDirective } from './directives/tooltips.directive';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TooltipDirective],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  menuNavigationOuvert = false;
  readonly typeConnexion = environment.production ? 'en ligne' : 'locale';
  public appVersion = environment.version;
  readonly anneeEnCours = new Date().getFullYear();

  constructor(
    public session: SessionService,
    public theme: ThemeService,
    public compteurs: CompteursContactsService,
    private supabase: SupabaseService,
    private router: Router,
  ) {
    effect(() => {
      if (this.session.estConnecte()) {
        void this.compteurs.rafraichir();
      }
    });

    // Filet de securite : rafraichit aussi apres chaque navigation.
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      if (this.session.estConnecte()) {
        void this.compteurs.rafraichir();
      }
    });
  }

  afficherApplication(): boolean {
    return (
      this.session.estConnecte() &&
      this.router.url !== '/changer-mot-de-passe' &&
      this.router.url !== '/login'
    );
  }

  basculerMenuNavigation(): void {
    this.menuNavigationOuvert = !this.menuNavigationOuvert;
  }

  fermerMenuNavigation(): void {
    this.menuNavigationOuvert = false;
  }

  async seDeconnecter(): Promise<void> {
    try {
      await this.supabase.seDeconnecter();
      this.session.effacerUtilisateur();
      await this.router.navigate(['/login']);
    } catch (error) {
      console.error('ERREUR DÉCONNEXION :', error);
    }
  }
}
