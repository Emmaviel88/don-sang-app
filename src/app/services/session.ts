import { Injectable, signal } from '@angular/core';

export interface UtilisateurConnecte {
  IdUser: number;
  Login: string;
  Role: string;
}

@Injectable({
  providedIn: 'root'
})
export class SessionService {

  utilisateur = signal<UtilisateurConnecte | null>(null);

  definirUtilisateur(utilisateur: UtilisateurConnecte): void {
    this.utilisateur.set(utilisateur);
  }

  effacerUtilisateur(): void {
    this.utilisateur.set(null);
  }

  estConnecte(): boolean {
    return this.utilisateur() !== null;
  }
}