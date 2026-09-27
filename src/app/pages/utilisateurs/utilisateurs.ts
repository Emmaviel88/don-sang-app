import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RechercheContactComponent } from '../../components/recherche-contact/recherche-contact';
import { ResultatRechercheContact } from '../../services/recherche-contact';
import { SessionService } from '../../services/session';
import { SupabaseService } from '../../services/supabase';

interface UtilisateurAdmin {
  IdUser: number;
  IdContact: number;
  AuthUserId: string | null;
  Role: string;
  Actif: boolean;
  PwdChangeReq: boolean;
  DerniereCnx: string | null;
  Login: string | null;
  Contact: ResultatRechercheContact | null;
}

@Component({
  selector: 'app-utilisateurs',
  standalone: true,
  imports: [DatePipe, FormsModule, RechercheContactComponent],
  templateUrl: './utilisateurs.html',
  styleUrl: './utilisateurs.css',
})
export class UtilisateursComponent implements OnInit {
  readonly utilisateurs = signal<UtilisateurAdmin[]>([]);
  readonly selection = signal<UtilisateurAdmin | null>(null);
  readonly creation = signal(false);
  readonly chargement = signal(false);
  readonly messageErreur = signal('');
  readonly messageSucces = signal('');

  recherche = '';
  contactCreation: ResultatRechercheContact | null = null;
  loginCreation = '';
  motDePasseInitial = '';
  roleCreation = 'User';
  roleModifie = 'User';
  actifModifie = true;
  changementMotDePasseModifie = true;

  constructor(
    private supabase: SupabaseService,
    private session: SessionService,
  ) {}

  ngOnInit(): void {
    if (this.peutGerer()) {
      void this.chargerUtilisateurs();
    }
  }

  peutGerer(): boolean {
    const role = this.session.utilisateur()?.Role;
    return role === 'Admin' || role === 'SA';
  }

  estSA(): boolean {
    return this.session.utilisateur()?.Role === 'SA';
  }

  rolesCreation(): string[] {
    return this.estSA() ? ['User', 'Admin', 'SA'] : ['User'];
  }

  utilisateursFiltres(): UtilisateurAdmin[] {
    const terme = this.recherche.trim().toLocaleLowerCase('fr');

    if (!terme) {
      return this.utilisateurs();
    }

    return this.utilisateurs().filter((utilisateur) => {
      const nomContact = utilisateur.Contact ? this.afficherNom(utilisateur.Contact) : '';
      return `${utilisateur.Login ?? ''} ${nomContact} ${utilisateur.Role}`
        .toLocaleLowerCase('fr')
        .includes(terme);
    });
  }

  afficherNom(contact: ResultatRechercheContact | null): string {
    if (!contact) {
      return 'Contact inconnu';
    }

    return [contact.NomUsage || contact.NomdeNaissance, contact.Prenom]
      .filter((valeur) => valeur !== null && valeur !== '')
      .join(' ');
  }

  peutModifierSelection(): boolean {
    const utilisateur = this.selection();
    return !!utilisateur && (this.estSA() || utilisateur.Role === 'User');
  }

  peutSupprimerSelection(): boolean {
    const utilisateur = this.selection();
    const acteur = this.session.utilisateur();

    if (!utilisateur || !acteur || utilisateur.IdUser === acteur.IdUser) {
      return false;
    }

    if (!this.estSA() && utilisateur.Role !== 'User') {
      return false;
    }

    const nombreSAActifs = this.utilisateurs().filter(
      (ligne) => ligne.Role === 'SA' && ligne.Actif,
    ).length;

    return !(utilisateur.Role === 'SA' && utilisateur.Actif && nombreSAActifs <= 1);
  }

  selectionner(utilisateur: UtilisateurAdmin): void {
    this.creation.set(false);
    this.selection.set(utilisateur);
    this.roleModifie = utilisateur.Role;
    this.actifModifie = utilisateur.Actif;
    this.changementMotDePasseModifie = utilisateur.PwdChangeReq;
    this.effacerMessages();
  }

  commencerCreation(): void {
    this.selection.set(null);
    this.creation.set(true);
    this.contactCreation = null;
    this.loginCreation = '';
    this.motDePasseInitial = '';
    this.roleCreation = 'User';
    this.effacerMessages();
  }

  annulerEdition(): void {
    this.creation.set(false);
    this.selection.set(null);
    this.effacerMessages();
  }

  selectionnerContact(contact: ResultatRechercheContact): void {
    this.contactCreation = contact;
  }

  gererErreurRecherche(error: unknown): void {
    console.error('ERREUR RECHERCHE CONTACT POUR UTILISATEUR :', error);
    this.messageErreur.set('Impossible de rechercher les contacts.');
  }

  async chargerUtilisateurs(): Promise<void> {
    this.chargement.set(true);
    this.messageErreur.set('');

    try {
      const reponse = await this.supabase.gererUtilisateurs<{
        utilisateurs: UtilisateurAdmin[];
      }>({ action: 'liste' });
      this.utilisateurs.set(reponse.utilisateurs ?? []);
    } catch (error) {
      this.signalerErreur('Impossible de charger les utilisateurs.', error);
    } finally {
      this.chargement.set(false);
    }
  }

  async creerUtilisateur(): Promise<void> {
    if (this.chargement()) {
      return;
    }

    if (!this.contactCreation) {
      this.messageErreur.set('Sélectionnez le contact associé à ce compte.');
      return;
    }

    if (
      this.motDePasseInitial.length < 8 ||
      !/[A-Z]/.test(this.motDePasseInitial) ||
      !/[@!%_\-0-9]/.test(this.motDePasseInitial)
    ) {
      this.messageErreur.set(
        'Le mot de passe initial doit contenir au moins 8 caractères, une majuscule et un chiffre ou l’un des caractères @ ! % - _.',
      );
      return;
    }

    this.chargement.set(true);
    this.effacerMessages();

    try {
      await this.supabase.gererUtilisateurs({
        action: 'creer',
        Login: this.loginCreation.trim(),
        IdContact: this.contactCreation.IdContact,
        Role: this.roleCreation,
        MotDePasseInitial: this.motDePasseInitial,
      });
      this.messageSucces.set(
        'Compte créé. L’utilisateur devra changer son mot de passe à la première connexion.',
      );
      this.creation.set(false);
      this.contactCreation = null;
      this.loginCreation = '';
      this.motDePasseInitial = '';
      await this.chargerUtilisateurs();
    } catch (error) {
      this.signalerErreur('La création du compte a échoué.', error);
    } finally {
      this.chargement.set(false);
    }
  }

  async enregistrerModifications(): Promise<void> {
    const utilisateur = this.selection();

    if (!utilisateur || this.chargement() || !this.peutModifierSelection()) {
      return;
    }

    this.chargement.set(true);
    this.effacerMessages();

    try {
      await this.supabase.gererUtilisateurs({
        action: 'modifier',
        IdUser: utilisateur.IdUser,
        Role: this.roleModifie,
        Actif: this.actifModifie,
        PwdChangeReq: this.changementMotDePasseModifie,
      });
      this.messageSucces.set('Les modifications ont été enregistrées.');
      await this.chargerUtilisateurs();
      const utilisateurActualise = this.utilisateurs().find(
        (ligne) => ligne.IdUser === utilisateur.IdUser,
      );
      if (utilisateurActualise) {
        this.selection.set(utilisateurActualise);
        this.roleModifie = utilisateurActualise.Role;
        this.actifModifie = utilisateurActualise.Actif;
        this.changementMotDePasseModifie = utilisateurActualise.PwdChangeReq;
      }
      this.messageSucces.set('Les modifications ont été enregistrées.');
    } catch (error) {
      this.signalerErreur('Les modifications ont échoué.', error);
    } finally {
      this.chargement.set(false);
    }
  }

  async supprimerUtilisateur(): Promise<void> {
    const utilisateur = this.selection();

    if (!utilisateur || this.chargement() || !this.peutSupprimerSelection()) {
      return;
    }

    const confirmation = window.confirm(
      `Supprimer définitivement le compte ${utilisateur.Login ?? '(sans login)'} et son accès Auth ? Cette action est irréversible.`,
    );
    if (!confirmation) {
      return;
    }

    this.chargement.set(true);
    this.effacerMessages();

    try {
      await this.supabase.gererUtilisateurs({
        action: 'supprimer',
        IdUser: utilisateur.IdUser,
      });
      this.selection.set(null);
      await this.chargerUtilisateurs();
      this.messageSucces.set('Le compte et son accès Auth ont été supprimés.');
    } catch (error) {
      this.signalerErreur('La suppression du compte a échoué.', error);
    } finally {
      this.chargement.set(false);
    }
  }

  private signalerErreur(message: string, error: unknown): void {
    console.error(message, error);
    this.messageErreur.set(
      error instanceof Error && error.message ? `${message} ${error.message}` : message,
    );
  }

  private effacerMessages(): void {
    this.messageErreur.set('');
    this.messageSucces.set('');
  }
}
