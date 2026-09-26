import { Component, effect, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DonneurSelectionService, DonneurSelectionne } from '../../services/donneur-selection';
import { SupabaseService } from '../../services/supabase';
import { SessionService } from '../../services/session';

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
  imports: [DatePipe],
  templateUrl: './adhesion-amicale.html',
  styleUrl: './adhesion-amicale.css',
})
export class AdhesionAmicale {
  donneurSelectionne = signal<DonneurSelectionne | null>(null);
  adhesions = signal<Adhesion[]>([]);

  anneeAEditer = signal(new Date().getFullYear() + 1);
  nbTotalAdherents = signal(0);
  message = signal('');

  constructor(
    private donneurSelection: DonneurSelectionService,
    private supabase: SupabaseService,
    private session: SessionService,
  ) {
    effect(() => {
      const donneur = this.donneurSelection.donneur();

      this.donneurSelectionne.set(donneur);

      if (donneur) {
        this.chargerAdhesions(donneur.IdContact);
      } else {
        this.adhesions.set([]);
      }
    });

    this.chargerNbAdherents(this.anneeAEditer());
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
    const utilisateur = this.session.utilisateur();

    return utilisateur?.Role === 'SA';
  }

  adhesionAnneeSelectionnee(): Adhesion | undefined {
    const annee = this.anneeAEditer();

    return this.adhesions().find((adhesion) => adhesion.annee === annee);
  }

  peutAjouterAdhesion(): boolean {
    if (!this.donneurSelectionne()) {
      return false;
    }

    if (!this.estSA()) {
      return false;
    }

    return !this.adhesionAnneeSelectionnee();
  }

  peutSupprimerAdhesion(): boolean {
    if (!this.donneurSelectionne()) {
      return false;
    }

    if (!this.estSA()) {
      return false;
    }

    return !!this.adhesionAnneeSelectionnee();
  }

  async ajouterAdhesion(): Promise<void> {
    const donneur = this.donneurSelectionne();

    if (!donneur) {
      return;
    }

    if (!this.estSA()) {
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

    if (!this.estSA()) {
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
