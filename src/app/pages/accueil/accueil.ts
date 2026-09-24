import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase';
import { SessionService } from '../../services/session';

@Component({
  selector: 'app-accueil',
  standalone: true,
  templateUrl: './accueil.html',
  styleUrl: './accueil.css'
})
export class AccueilComponent {

  constructor(
    private supabase: SupabaseService,
    public session: SessionService,
    private router: Router
  ) {
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