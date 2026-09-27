import { DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DonneurSelectionService, DonneurSelectionne } from '../../services/donneur-selection';
import { AffectationComite, FonctionComite, SupabaseService } from '../../services/supabase';
import {
  RechercheContactController,
  ResultatRechercheContact,
} from '../../services/recherche-contact';

@Component({
  imports: [DatePipe, FormsModule],
  selector: 'app-comite',
  styleUrl: './comite.css',
  templateUrl: './comite.html',
})
export class Comite implements OnDestroy, OnInit {
  private readonly fonctionsUniques = new Set([
    'Président(e)',
    'Trésorière',
    'Trésorière Adjointe',
    'Secrétaire',
    'Secrétaire Adjoint(e)',
  ]);

  recherche = '';
  readonly rechercheContacts: RechercheContactController;
  fonctions: FonctionComite[] = [];
  affectations: AffectationComite[] = [];
  membreSelectionne: DonneurSelectionne | null = null;
  idAffectationSelectionnee: number | null = null;
  message = '';
  messageSucces = '';
  chargement = true;
  enregistrementEnCours = false;
  dateEffet = this.dateDuJour();
  idFonctionSelectionnee: number | null = null;

  constructor(
    private supabase: SupabaseService,
    private selectionDonneur: DonneurSelectionService,
    private cdr: ChangeDetectorRef,
  ) {
    this.rechercheContacts = new RechercheContactController(this.supabase.client, this.cdr);
    this.membreSelectionne = this.selectionDonneur.donneur();
  }

  async ngOnInit(): Promise<void> {
    await this.chargerComite();

    const membre = this.selectionDonneur.donneur();

    if (membre) {
      this.membreSelectionne = membre;
    }
  }

  async chargerComite(): Promise<void> {
    this.chargement = true;

    try {
      const [fonctions, affectations] = await Promise.all([
        this.supabase.getFonctionsComite(),
        this.supabase.getAffectationsComiteActuelles(),
      ]);

      this.fonctions = fonctions;
      this.affectations = affectations;
    } catch (error) {
      console.error('ERREUR CHARGEMENT COMITÉ :', error);
      this.message = 'Impossible de charger le comité.';
    } finally {
      this.chargement = false;
      this.cdr.detectChanges();
    }
  }

  rechercherMembres(): void {
    this.message = '';
    this.rechercheContacts.rechercher(this.recherche, (error) => {
      console.error('ERREUR RECHERCHE MEMBRE DU COMITÉ :', error);
      this.message = 'Erreur pendant la recherche.';
    });
  }

  async selectionnerMembre(resultat: ResultatRechercheContact): Promise<void> {
    this.rechercheContacts.annuler();
    this.recherche = '';
    this.message = '';

    try {
      const { data, error } = await this.supabase.client
        .from('t_Contacts')
        .select('IdContact, NomUsage, Prenom, DateNaissance, NbDonsAvant2013')
        .eq('IdContact', resultat.IdContact)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        this.message = 'Membre introuvable.';
        return;
      }

      const selectionActuelle = this.selectionDonneur.donneur();
      const membre: DonneurSelectionne = {
        IdContact: data.IdContact,
        NomUsage: data.NomUsage,
        Prenom: data.Prenom,
        DateNaissance: data.DateNaissance,
        NbDonsAvant2013: data.NbDonsAvant2013 ?? 0,
        eligible:
          selectionActuelle && selectionActuelle.IdContact === data.IdContact
            ? selectionActuelle.eligible
            : false,
      };

      this.definirMembreSelectionne(membre);
    } catch (error) {
      console.error('ERREUR SÉLECTION MEMBRE :', error);
      this.message = 'Impossible de sélectionner le membre.';
    } finally {
      this.cdr.detectChanges();
    }
  }

  selectionnerAffectation(affectation: AffectationComite): void {
    this.idAffectationSelectionnee = affectation.IdContactFonction;
    this.idFonctionSelectionnee = affectation.IdFonction;

    const selectionActuelle = this.selectionDonneur.donneur();
    const membre: DonneurSelectionne = {
      IdContact: affectation.Contact.IdContact,
      NomUsage: affectation.Contact.NomUsage,
      Prenom: affectation.Contact.Prenom,
      DateNaissance: affectation.Contact.DateNaissance,
      NbDonsAvant2013: affectation.Contact.NbDonsAvant2013 ?? 0,
      eligible:
        selectionActuelle && selectionActuelle.IdContact === affectation.Contact.IdContact
          ? selectionActuelle.eligible
          : false,
    };

    this.definirMembreSelectionne(membre);
  }

  naviguerDansAffectations(event: KeyboardEvent, indexActuel: number): void {
    let indexCible: number;

    switch (event.key) {
      case 'ArrowDown':
        indexCible = Math.min(indexActuel + 1, this.affectations.length - 1);
        break;
      case 'ArrowUp':
        indexCible = Math.max(indexActuel - 1, 0);
        break;
      case 'Home':
        indexCible = 0;
        break;
      case 'End':
        indexCible = this.affectations.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();

    const affectation = this.affectations[indexCible];
    const lignes = (
      event.currentTarget as HTMLElement
    ).parentElement?.querySelectorAll<HTMLTableRowElement>('[data-affectation-row]');
    const ligneCible = lignes?.item(indexCible);

    if (affectation && ligneCible) {
      this.selectionnerAffectation(affectation);
      ligneCible.focus();
    }
  }

  private definirMembreSelectionne(membre: DonneurSelectionne): void {
    this.membreSelectionne = membre;
    this.selectionDonneur.definirDonneur(membre);
  }

  affectationsDuMembre(): AffectationComite[] {
    const idContact = this.membreSelectionne?.IdContact;

    if (idContact === undefined) {
      return [];
    }

    return this.affectations.filter((affectation) => affectation.IdContact === idContact);
  }

  membreEstAuComite(): boolean {
    const idContact = this.membreSelectionne?.IdContact;

    return (
      idContact !== undefined &&
      this.affectations.some((affectation) => affectation.IdContact === idContact)
    );
  }

  get nombreMembresComite(): number {
    return new Set(this.affectations.map((affectation) => affectation.IdContact)).size;
  }

  fonctionEstDisponible(): boolean {
    const fonction = this.fonctions.find(
      (element) => element.IdFonction === this.idFonctionSelectionnee,
    );

    if (!fonction) {
      return false;
    }

    return (
      !this.fonctionsUniques.has(fonction.Libelle) ||
      !this.affectations.some((affectation) => affectation.IdFonction === fonction.IdFonction)
    );
  }

  private affectationSelectionnee(): AffectationComite | undefined {
    return this.affectations.find(
      (affectation) => affectation.IdContactFonction === this.idAffectationSelectionnee,
    );
  }

  private fonctionEstDisponiblePourModification(): boolean {
    const fonction = this.fonctions.find(
      (element) => element.IdFonction === this.idFonctionSelectionnee,
    );

    if (!fonction) {
      return false;
    }

    if (!this.fonctionsUniques.has(fonction.Libelle)) {
      return true;
    }

    return !this.affectations.some(
      (affectation) =>
        affectation.IdFonction === fonction.IdFonction &&
        affectation.IdContactFonction !== this.idAffectationSelectionnee,
    );
  }

  private fonctionDejaAssigneePourModification(): boolean {
    const affectation = this.affectationSelectionnee();

    return (
      affectation !== undefined &&
      this.idFonctionSelectionnee !== null &&
      this.affectations.some(
        (autreAffectation) =>
          autreAffectation.IdContact === affectation.IdContact &&
          autreAffectation.IdFonction === this.idFonctionSelectionnee &&
          autreAffectation.IdContactFonction !== affectation.IdContactFonction,
      )
    );
  }

  private fonctionMembreInterditePourModification(): boolean {
    const affectation = this.affectationSelectionnee();
    const fonction = this.fonctions.find(
      (element) => element.IdFonction === this.idFonctionSelectionnee,
    );

    return (
      affectation !== undefined &&
      fonction?.Libelle === 'Membre' &&
      this.affectations.some(
        (autreAffectation) =>
          autreAffectation.IdContact === affectation.IdContact &&
          autreAffectation.IdContactFonction !== affectation.IdContactFonction &&
          autreAffectation.Fonction.Libelle !== 'Membre',
      )
    );
  }

  peutModifierFonction(): boolean {
    const affectation = this.affectationSelectionnee();

    return (
      affectation !== undefined &&
      this.idFonctionSelectionnee !== null &&
      this.idFonctionSelectionnee !== affectation.IdFonction &&
      !this.fonctionDejaAssigneePourModification() &&
      !this.fonctionMembreInterditePourModification() &&
      this.fonctionEstDisponiblePourModification() &&
      !this.chargement &&
      !this.enregistrementEnCours
    );
  }

  messageEtatModificationFonction(): string {
    const affectation = this.affectationSelectionnee();

    if (!affectation) {
      return '';
    }

    if (this.idFonctionSelectionnee === null) {
      return 'Choisissez la nouvelle fonction.';
    }

    if (this.idFonctionSelectionnee === affectation.IdFonction) {
      return 'Choisissez une fonction différente de la fonction actuelle.';
    }

    if (this.fonctionDejaAssigneePourModification()) {
      return 'Ce contact possède déjà cette fonction.';
    }

    if (this.fonctionMembreInterditePourModification()) {
      return 'Un membre ayant une autre fonction active ne peut pas recevoir aussi la fonction « Membre ». ';
    }

    if (!this.fonctionEstDisponiblePourModification()) {
      return 'Cette fonction est déjà occupée par un autre membre.';
    }

    return '';
  }

  fonctionDejaAssigneeAuMembre(): boolean {
    return (
      this.membreSelectionne !== null &&
      this.idFonctionSelectionnee !== null &&
      this.affectations.some(
        (affectation) =>
          affectation.IdContact === this.membreSelectionne?.IdContact &&
          affectation.IdFonction === this.idFonctionSelectionnee,
      )
    );
  }

  fonctionMembreInterdite(): boolean {
    const fonction = this.fonctions.find(
      (element) => element.IdFonction === this.idFonctionSelectionnee,
    );

    return (
      fonction?.Libelle === 'Membre' &&
      this.affectationsDuMembre().some((affectation) => affectation.Fonction.Libelle !== 'Membre')
    );
  }

  peutAjouterMembre(): boolean {
    return (
      this.membreSelectionne !== null &&
      !this.membreEstAuComite() &&
      this.idFonctionSelectionnee !== null &&
      this.fonctionEstDisponible() &&
      !this.chargement &&
      !this.enregistrementEnCours
    );
  }

  peutAjouterFonction(): boolean {
    return (
      this.membreSelectionne !== null &&
      this.membreEstAuComite() &&
      this.idFonctionSelectionnee !== null &&
      !this.fonctionMembreInterdite() &&
      !this.fonctionDejaAssigneeAuMembre() &&
      this.fonctionEstDisponible() &&
      !this.chargement &&
      !this.enregistrementEnCours
    );
  }

  messageEtatAjoutMembre(): string {
    if (!this.membreSelectionne) {
      return '';
    }

    if (this.membreEstAuComite()) {
      return 'Ce contact fait déjà partie du comité. « Ajouter Membre » ne s’applique pas.';
    }

    if (this.idFonctionSelectionnee === null) {
      return 'Choisissez une fonction à attribuer.';
    }

    if (!this.fonctionEstDisponible()) {
      return 'Cette fonction est déjà occupée et ne peut pas être attribuée.';
    }

    return '';
  }

  messageEtatAjoutFonction(): string {
    if (!this.membreSelectionne) {
      return '';
    }

    if (!this.membreEstAuComite()) {
      return 'Ce contact ne fait pas encore partie du comité. Utilisez « Ajouter Membre ».';
    }

    if (this.idFonctionSelectionnee === null) {
      return '';
    }

    if (this.fonctionMembreInterdite()) {
      return 'Un membre ayant déjà une autre fonction ne peut pas recevoir aussi la fonction « Membre ». ';
    }

    if (this.fonctionDejaAssigneeAuMembre()) {
      return 'Ce contact possède déjà cette fonction.';
    }

    if (!this.fonctionEstDisponible()) {
      return 'Cette fonction est déjà occupée par un autre membre.';
    }

    return '';
  }

  async ajouterMembre(): Promise<void> {
    const membre = this.membreSelectionne;
    const idFonction = this.idFonctionSelectionnee;

    if (!this.peutAjouterMembre() || !membre || idFonction === null) {
      return;
    }

    this.enregistrementEnCours = true;
    this.message = '';
    this.messageSucces = '';

    try {
      await this.supabase.ajouterMembreComite(membre.IdContact, idFonction, this.dateEffet);
      await this.chargerComite();
      this.messageSucces = 'Le membre a été ajouté au comité.';
    } catch (error) {
      console.error('ERREUR AJOUT MEMBRE AU COMITÉ :', error);
      this.message = error instanceof Error ? error.message : 'Impossible d’ajouter le membre.';
    } finally {
      this.enregistrementEnCours = false;
      this.cdr.detectChanges();
    }
  }

  async ajouterFonction(): Promise<void> {
    const membre = this.membreSelectionne;
    const idFonction = this.idFonctionSelectionnee;

    if (!this.peutAjouterFonction() || !membre || idFonction === null) {
      return;
    }

    this.enregistrementEnCours = true;
    this.message = '';
    this.messageSucces = '';

    try {
      await this.supabase.ajouterFonctionComite(membre.IdContact, idFonction, this.dateEffet);
      await this.chargerComite();
      this.messageSucces = 'La fonction a été attribuée au membre.';
    } catch (error) {
      console.error('ERREUR AJOUT FONCTION AU COMITÉ :', error);
      this.message = error instanceof Error ? error.message : 'Impossible d’ajouter la fonction.';
    } finally {
      this.enregistrementEnCours = false;
      this.cdr.detectChanges();
    }
  }

  async modifierFonction(): Promise<void> {
    const affectation = this.affectationSelectionnee();
    const idFonction = this.idFonctionSelectionnee;

    if (!this.peutModifierFonction() || !affectation || idFonction === null) {
      return;
    }

    this.enregistrementEnCours = true;
    this.message = '';
    this.messageSucces = '';

    try {
      await this.supabase.modifierFonctionComite(
        affectation.IdContactFonction,
        idFonction,
        this.dateEffet,
      );
      await this.chargerComite();
      this.idAffectationSelectionnee = null;
      this.messageSucces = 'La fonction du membre a été modifiée.';
    } catch (error) {
      console.error('ERREUR MODIFICATION FONCTION DU COMITÉ :', error);
      this.message = error instanceof Error ? error.message : 'Impossible de modifier la fonction.';
    } finally {
      this.enregistrementEnCours = false;
      this.cdr.detectChanges();
    }
  }

  afficherNom(contact: {
    NomUsage: string | null;
    NomdeNaissance?: string | null;
    Prenom: string | null;
  }): string {
    const nom = contact.NomUsage || contact.NomdeNaissance || '';

    return [nom, contact.Prenom].filter((valeur) => valeur !== null && valeur !== '').join(' ');
  }

  dureeFonction(dateDebut: string | null): string {
    if (!dateDebut) {
      return '—';
    }

    const debut = this.dateLocale(dateDebut);
    const aujourdHui = new Date();
    let mois =
      (aujourdHui.getFullYear() - debut.getFullYear()) * 12 +
      aujourdHui.getMonth() -
      debut.getMonth();

    if (aujourdHui.getDate() < debut.getDate()) {
      mois--;
    }

    const moisTotaux = Math.max(0, mois);
    const annees = Math.floor(moisTotaux / 12);
    const moisRestants = moisTotaux % 12;

    if (annees === 0 && moisRestants === 0) {
      return 'Moins d’un mois';
    }

    return `${annees > 0 ? `${annees} an${annees > 1 ? 's' : ''}` : ''}${annees > 0 && moisRestants > 0 ? ' et ' : ''}${moisRestants > 0 ? `${moisRestants} mois` : ''}`;
  }

  estAffectationSelectionnee(affectation: AffectationComite): boolean {
    return this.idAffectationSelectionnee === affectation.IdContactFonction;
  }

  peutEnleverFonction(): boolean {
    return (
      this.affectationSelectionnee() !== undefined &&
      !this.chargement &&
      !this.enregistrementEnCours
    );
  }

  async enleverFonction(): Promise<void> {
    const affectation = this.affectationSelectionnee();

    if (!affectation || !this.peutEnleverFonction()) {
      return;
    }

    this.enregistrementEnCours = true;
    this.message = '';
    this.messageSucces = '';

    try {
      await this.supabase.enleverFonctionComite(affectation.IdContactFonction, this.dateEffet);
      await this.chargerComite();
      this.idAffectationSelectionnee = null;
      this.messageSucces = 'La fonction a été retirée du comité.';
    } catch (error) {
      console.error('ERREUR RETRAIT FONCTION DU COMITÉ :', error);
      this.message = error instanceof Error ? error.message : 'Impossible de retirer la fonction.';
    } finally {
      this.enregistrementEnCours = false;
      this.cdr.detectChanges();
    }
  }

  peutEnleverMembre(): boolean {
    return (
      this.membreSelectionne !== null &&
      this.membreEstAuComite() &&
      !this.chargement &&
      !this.enregistrementEnCours
    );
  }

  messageEtatEnleverMembre(): string {
    if (!this.membreSelectionne) {
      return 'Sélectionnez un contact pour pouvoir enlever ses fonctions.';
    }

    if (!this.membreEstAuComite()) {
      return 'Ce contact n’a aucune fonction active au comité.';
    }

    return '';
  }

  async enleverMembre(): Promise<void> {
    const membre = this.membreSelectionne;

    if (!this.peutEnleverMembre() || !membre) {
      return;
    }

    const nombreFonctionsActives = this.affectationsDuMembre().length;
    const dateConfirmee = this.dateLocale(this.dateEffet).toLocaleDateString('fr-FR');
    const confirmation = window.confirm(
      `Confirmer la fin des ${nombreFonctionsActives} fonction${nombreFonctionsActives > 1 ? 's' : ''} actives de ${this.afficherNom(membre)} au ${dateConfirmee} ?`,
    );

    if (!confirmation) {
      return;
    }

    this.enregistrementEnCours = true;
    this.message = '';
    this.messageSucces = '';

    try {
      const nombreFonctions = await this.supabase.enleverMembreComite(
        membre.IdContact,
        this.dateEffet,
      );
      await this.chargerComite();
      this.idAffectationSelectionnee = null;
      this.messageSucces = `${nombreFonctions} fonction${nombreFonctions > 1 ? 's' : ''} du membre terminée${nombreFonctions > 1 ? 's' : ''}.`;
    } catch (error) {
      console.error('ERREUR RETRAIT MEMBRE DU COMITÉ :', error);
      this.message = error instanceof Error ? error.message : 'Impossible de retirer le membre.';
    } finally {
      this.enregistrementEnCours = false;
      this.cdr.detectChanges();
    }
  }

  private dateDuJour(): string {
    const aujourdhui = new Date();

    return `${aujourdhui.getFullYear()}-${String(aujourdhui.getMonth() + 1).padStart(2, '0')}-${String(aujourdhui.getDate()).padStart(2, '0')}`;
  }

  private dateLocale(date: string): Date {
    const [annee, mois, jour] = date.split('-').map(Number);

    return new Date(annee, mois - 1, jour);
  }

  ngOnDestroy(): void {
    this.rechercheContacts.detruire();
  }
}
