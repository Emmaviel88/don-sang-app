import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase';

@Component({
  selector: 'app-changer-mot-de-passe',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './changer-mot-de-passe.html',
  styleUrl: './changer-mot-de-passe.css'
})
export class ChangerMotDePasseComponent {

  nouveauMotDePasse = '';
  confirmation = '';
  message = '';
  chargement = false;

  constructor(
    private supabase: SupabaseService,
    private router: Router
  ) {
  }

  async changerMotDePasse() {

    if (this.chargement) {
      return;
    }

    this.message = '';
    // Validation du mot de passe longueur >= 8 caractères
    if (this.nouveauMotDePasse.length < 8) {
      this.message = 'Le mot de passe doit comporter au moins 8 caractères.';
      return;
    }
    // Validation du mot de passe au moins une majuscule
    if (!/[A-Z]/.test(this.nouveauMotDePasse)) {
      this.message = 'Le mot de passe doit comporter au moins une majuscule.';
      return;
    }
    // Validation du mot de passe au moins un caractère spécial parmi @ ! % - _
    if (!/[@!%_\-0-9]/.test(this.nouveauMotDePasse)) {
      this.message = 'Le mot de passe doit comporter au moins un chiffre (0 à 9) ou un caractère spécial parmi (@ ! % - _).';
      return;
    }
    // Identité du Mot de passe et Confirmation
    if (this.nouveauMotDePasse !== this.confirmation) {
      this.message = 'Les deux mots de passe ne correspondent pas.';
      return;
    }

    this.chargement = true;

    const { error: passwordError } =
      await this.supabase.client.auth.updateUser({
        password: this.nouveauMotDePasse
      });

    if (passwordError) {
      this.chargement = false;
      this.message = 'Erreur lors du changement de mot de passe.';
      console.error('ERREUR CHANGEMENT MOT DE PASSE :', passwordError);
      return;
    }

    const { error: userError } =
      await this.supabase.client.rpc('valider_changement_mot_de_passe');

    if (userError) {
      this.chargement = false;
      this.message = 'Mot de passe modifié, mais la validation du changement a échoué.';
      console.error('ERREUR VALIDATION MOT DE PASSE :', userError);
      return;
    }

    this.chargement = false;
    this.message = 'Mot de passe modifié avec succès.';

    await this.router.navigate(['/accueil']);
  }
}