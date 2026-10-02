import { Component, effect, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { SupabaseService } from './services/supabase';
import { SessionService } from './services/session';
import { ThemeService } from './services/theme';
import { environment } from '../environments/environment';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  menuNavigationOuvert = false;
  readonly typeConnexion = environment.production ? 'en ligne' : 'locale';
  readonly nombreContacts = signal<number | null>(null);
  readonly nombreContactsActifs = signal<number | null>(null);

  constructor(
    public session: SessionService,
    public theme: ThemeService,
    private supabase: SupabaseService,
    private router: Router,
  ) {
    effect(() => {
      if (this.session.estConnecte()) {
        void this.chargerNombreContacts();
      }
    });

    // Rafraichit le total apres chaque navigation (creation/suppression de donneur).
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      if (this.session.estConnecte()) {
        void this.chargerNombreContacts();
      }
    });
  }

  private async chargerNombreContacts(): Promise<void> {
    const [total, actifs] = await Promise.all([
      this.supabase.client.from('t_Contacts').select('*', { count: 'exact', head: true }),
      this.supabase.client
        .from('t_Contacts')
        .select('*', { count: 'exact', head: true })
        .eq('Actif', true),
    ]);

    if (total.error || actifs.error) {
      console.error('ERREUR COMPTAGE CONTACTS :', total.error ?? actifs.error);
      return;
    }

    this.nombreContacts.set(total.count);
    this.nombreContactsActifs.set(actifs.count);
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
