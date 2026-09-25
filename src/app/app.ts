import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SupabaseService } from './services/supabase';
import { SessionService } from './services/session';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {

  constructor(
    public session: SessionService,
    private supabase: SupabaseService,
    private router: Router
  ) {
  }

  afficherApplication(): boolean {
    return (
      this.session.estConnecte() &&
      this.router.url !== '/changer-mot-de-passe' &&
      this.router.url !== '/login'
    );
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