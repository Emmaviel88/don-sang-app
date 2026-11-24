import { Component, computed, effect, signal } from '@angular/core';
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

    effect((onCleanup) => {
      if (!this.session.estConnecte()) {
        return;
      }

      void this.rafraichirAcces();
      const minuteur = setInterval(() => void this.rafraichirAcces(), 30000);
      const horloge = setInterval(() => {
        this.maintenant.set(Date.now());

        const jusqua = this.etatAcces().jusqua;
        if (jusqua && Date.now() >= jusqua.getTime()) {
          void this.rafraichirAcces();
        }
      }, 5000);
      onCleanup(() => {
        clearInterval(minuteur);
        clearInterval(horloge);
      });
    });

    // Filet de securite : rafraichit aussi apres chaque navigation.
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      if (this.session.estConnecte()) {
        void this.compteurs.rafraichir();
      }
    });
  }

  readonly dureesAcces = [1, 2, 3, 4];
  etatAcces = signal<{ ouvert: boolean; jusqua: Date | null }>({ ouvert: false, jusqua: null });
  menuAccesOuvert = signal(false);
  maintenant = signal(Date.now());

  // Minutes restantes (arrondi au supérieur) pour les non-SA, uniquement dans les 10 dernières minutes
  minutesAvantFermeture = computed<number | null>(() => {
    const jusqua = this.etatAcces().jusqua;
    if (!jusqua || this.estSA()) {
      return null;
    }

    const minutes = Math.ceil((jusqua.getTime() - this.maintenant()) / 60000);
    return minutes > 0 && minutes <= 10 ? minutes : null;
  });

  estSA(): boolean {
    return this.session.utilisateur()?.Role === 'SA';
  }

  async rafraichirAcces(): Promise<void> {
    try {
      const etat = await this.supabase.getEtatAcces();
      this.etatAcces.set(etat);

      if (!etat.ouvert && !this.estSA() && this.session.estConnecte()) {
        this.session.messageDeconnexion.set(
          "L'accès à l'application a été clôturé par le SA. Vous avez été déconnecté.",
        );
        await this.seDeconnecter();
      }
    } catch (error) {
      console.error('ERREUR ÉTAT ACCÈS :', error);
    }
  }

  async definirAcces(dureeHeures: number): Promise<void> {
    this.menuAccesOuvert.set(false);

    try {
      await this.supabase.definirAccesApplication(dureeHeures);
      await this.rafraichirAcces();
    } catch (error) {
      console.error('ERREUR DÉFINITION ACCÈS :', error);
    }
  }

  heureLimite(): string {
    const jusqua = this.etatAcces().jusqua;
    return jusqua ? jusqua.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
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
