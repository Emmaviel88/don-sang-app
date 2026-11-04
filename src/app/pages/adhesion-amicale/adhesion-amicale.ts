import { ChangeDetectorRef, Component, effect, OnDestroy, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DonneurSelectionService, DonneurSelectionne } from '../../services/donneur-selection';
import { SupabaseService } from '../../services/supabase';
import { SessionService } from '../../services/session';
import { ExportDonneursExcelService } from '../../services/export-donneurs-excel';
import {
  RechercheContactController,
  ResultatRechercheContact,
} from '../../services/recherche-contact';

interface Adhesion {
  IdAdhesion: number;
  IdContact: number;
  annee: number;
  DateAdhesion: string | null;
  Cotisation: number | null;
  Statut: string | null;
}

@Component({
  selector: 'app-adhesion-amicale',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './adhesion-amicale.html',
  styleUrl: './adhesion-amicale.css',
})
export class AdhesionAmicale implements OnDestroy {
  donneurSelectionne = signal<DonneurSelectionne | null>(null);
  adhesions = signal<Adhesion[]>([]);

  recherche = '';
  readonly rechercheContacts: RechercheContactController;

  anneeAEditer = signal(new Date().getFullYear() + 1);
  nbTotalAdherents = signal(0);
  message = signal('');
  exportAdherentsEnCours = signal(false);
  exportInvitesEnCours = signal(false);

  constructor(
    private donneurSelection: DonneurSelectionService,
    private supabase: SupabaseService,
    private session: SessionService,
    private cdr: ChangeDetectorRef,
    private exportExcel: ExportDonneursExcelService,
  ) {
    this.rechercheContacts = new RechercheContactController(this.supabase.client, this.cdr);

    effect(() => {
      const donneur = this.donneurSelection.donneur();

      this.donneurSelectionne.set(donneur);

      if (donneur) {
        void this.chargerAdhesions(donneur.IdContact);
      } else {
        this.adhesions.set([]);
      }
    });

    void this.chargerNbAdherents(this.anneeAEditer());
  }

  ngOnDestroy(): void {
    this.rechercheContacts.detruire();
  }

  rechercherDonneurs(): void {
    this.rechercheContacts.rechercher(this.recherche, (error) => {
      console.error('ERREUR RECHERCHE DONNEUR :', error);
      this.message.set('Erreur pendant la recherche.');
    });
  }

  async selectionnerDonneur(idContact: number): Promise<void> {
    this.rechercheContacts.annuler();

    try {
      this.message.set('');

      const { data, error } = await this.supabase.client
        .from('t_Contacts')
        .select(
          `
          IdContact,
          NomUsage,
          Prenom,
          DateNaissance,
          NbDonsAvant2013
        `,
        )
        .eq('IdContact', idContact)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        this.message.set('Donneur introuvable.');
        return;
      }

      this.donneurSelection.definirDonneur({
        IdContact: data.IdContact,
        NomUsage: data.NomUsage,
        Prenom: data.Prenom,
        DateNaissance: data.DateNaissance,
        NbDonsAvant2013: data.NbDonsAvant2013 ?? 0,
        eligible: false,
      });

      this.recherche = '';

      this.cdr.detectChanges();
    } catch (error) {
      console.error('ERREUR SÉLECTION DONNEUR :', error);
      this.message.set('Impossible de sélectionner le donneur.');

      this.cdr.detectChanges();
    }
  }

  afficherResultat(resultat: ResultatRechercheContact): string {
    return this.rechercheContacts.afficherNom(resultat);
  }

  async chargerAdhesions(IdContact: number): Promise<void> {
    try {
      console.log('ID CONTACT ADHÉSIONS :', IdContact);

      const adhesions = await this.supabase.getAdhesions(IdContact);

      console.log('ADHÉSIONS CHARGÉES :', adhesions);

      this.adhesions.set(adhesions);
    } catch (error) {
      console.error('ERREUR CHARGEMENT ADHÉSIONS :', error);
      this.adhesions.set([]);
    }
  }

  async chargerNbAdherents(annee: number): Promise<void> {
    try {
      const nbAdherents = await this.supabase.getNbAdherents(annee);

      this.nbTotalAdherents.set(nbAdherents);
    } catch (error) {
      console.error('ERREUR CHARGEMENT NOMBRE ADHÉRENTS :', error);
      this.nbTotalAdherents.set(0);
    }
  }

  async selectionnerAnnee(annee: number): Promise<void> {
    const anneeMax = new Date().getFullYear() + 1;

    if (annee > anneeMax) {
      this.message.set(
        `L'année ${annee} ne peut pas être sélectionnée : les adhésions ne peuvent actuellement pas être enregistrées au delà de l'année ${anneeMax}.`,
      );
      return;
    }

    this.message.set('');
    this.anneeAEditer.set(annee);

    await this.chargerNbAdherents(annee);
  }

  estSA(): boolean {
    return this.session.utilisateur()?.Role === 'SA';
  }

  estAdmin(): boolean {
    return this.session.utilisateur()?.Role === 'Admin';
  }

  async exporterAdherents(): Promise<void> {
    if ((!this.estSA() && !this.estAdmin()) || this.exportAdherentsEnCours()) {
      return;
    }

    this.exportAdherentsEnCours.set(true);
    this.message.set('');

    try {
      const { nbTotal, nbMails } = await this.exportExcel.exporterAdherents(
        new Date().getFullYear(),
      );

      this.message.set(`Export terminé : ${nbTotal} personnes, ${nbMails} adresses mail connues.`);
    } catch (error) {
      console.error('ERREUR EXPORT ADHÉRENTS :', error);
      this.message.set("Impossible d'exporter la liste des adhérents : " + error);
    } finally {
      this.exportAdherentsEnCours.set(false);
    }
  }

  readonly anneeFinInvites = new Date().getFullYear();
  readonly anneeDebutInvites = this.anneeFinInvites - 5;

  async exporterInvitesSoiree(): Promise<void> {
    if ((!this.estSA() && !this.estAdmin()) || this.exportInvitesEnCours()) {
      return;
    }

    this.exportInvitesEnCours.set(true);
    this.message.set('Préparation de la liste en cours ...');

    try {
      const { nbTotal, nbMails } = await this.exportExcel.exporterInvitesSoiree(
        this.anneeFinInvites,
      );

      this.message.set(`Export terminé : ${nbTotal} personnes, ${nbMails} adresses mail connues.`);
    } catch (error) {
      console.error('ERREUR EXPORT INVITÉS SOIRÉE :', error);
      this.message.set("Impossible d'exporter la liste des invités : " + error);
    } finally {
      this.exportInvitesEnCours.set(false);
    }
  }

  peutModifierAdhesions(): boolean {
    const role = this.session.utilisateur()?.Role;

    return role === 'SA' || role === 'Admin';
  }

  adhesionAnneeSelectionnee(): Adhesion | undefined {
    const annee = this.anneeAEditer();

    return this.adhesions().find((adhesion) => adhesion.annee === annee);
  }

  peutAjouterAdhesion(): boolean {
    if (!this.donneurSelectionne()) {
      return false;
    }

    if (!this.peutModifierAdhesions()) {
      return false;
    }

    return !this.adhesionAnneeSelectionnee();
  }

  peutSupprimerAdhesion(): boolean {
    if (!this.donneurSelectionne()) {
      return false;
    }

    if (!this.peutModifierAdhesions()) {
      return false;
    }

    return !!this.adhesionAnneeSelectionnee();
  }

  async ajouterAdhesion(): Promise<void> {
    const donneur = this.donneurSelectionne();

    if (!donneur) {
      return;
    }

    if (!this.peutModifierAdhesions()) {
      return;
    }

    if (this.adhesionAnneeSelectionnee()) {
      return;
    }

    try {
      this.message.set('');

      await this.supabase.ajouterAdhesion(donneur.IdContact, this.anneeAEditer());

      await this.chargerAdhesions(donneur.IdContact);
      await this.chargerNbAdherents(this.anneeAEditer());
    } catch (error) {
      console.error('ERREUR AJOUT ADHÉSION :', error);
      this.message.set('Impossible d’ajouter l’adhésion.');
    }
  }

  async supprimerAdhesion(): Promise<void> {
    const donneur = this.donneurSelectionne();
    const adhesion = this.adhesionAnneeSelectionnee();

    if (!donneur || !adhesion) {
      return;
    }

    if (!this.peutModifierAdhesions()) {
      return;
    }

    try {
      this.message.set('');

      await this.supabase.supprimerAdhesion(adhesion.IdAdhesion);

      await this.chargerAdhesions(donneur.IdContact);
      await this.chargerNbAdherents(this.anneeAEditer());
    } catch (error) {
      console.error('ERREUR SUPPRESSION ADHÉSION :', error);
      this.message.set('Impossible de supprimer l’adhésion.');
    }
  }
}
