import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase';

export interface UtilisateurConnecte {
  IdUser: number;

  Login: string;

  Role: string;
}

@Injectable({
  providedIn: 'root',
})
export class SessionService {
  utilisateur = signal<UtilisateurConnecte | null>(null);

  private sessionRestaurée: Promise<void>;

  constructor(private supabase: SupabaseService) {
    this.sessionRestaurée = this.restaurerSession();
  }

  definirUtilisateur(utilisateur: UtilisateurConnecte): void {
    this.utilisateur.set(utilisateur);
  }

  effacerUtilisateur(): void {
    this.utilisateur.set(null);
  }

  estConnecte(): boolean {
    return this.utilisateur() !== null;
  }

  async attendreRestaurationSession(): Promise<void> {
    await this.sessionRestaurée;
  }

  private async restaurerSession(): Promise<void> {
    try {
      const { data: sessionData, error: sessionError } =
        await this.supabase.client.auth.getSession();

      if (sessionError) {
        console.error('ERREUR RÉCUPÉRATION SESSION :', sessionError);

        return;
      }

      if (!sessionData.session) {
        return;
      }

      const { data: userData, error: userError } =
        await this.supabase.client.rpc('get_mon_utilisateur');

      if (userError) {
        console.error('ERREUR RÉCUPÉRATION UTILISATEUR :', userError);

        return;
      }

      if (!userData || userData.length === 0) {
        return;
      }

      const utilisateur = userData[0];

      this.utilisateur.set({
        IdUser: utilisateur.IdUser,

        Login: utilisateur.Login,

        Role: utilisateur.Role,
      });
    } catch (error) {
      console.error('ERREUR RESTAURATION SESSION :', error);
    }
  }
}
